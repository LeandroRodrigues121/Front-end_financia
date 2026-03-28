<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';

const today = new Date().toISOString().slice(0, 10);

const categories = [
    'moradia',
    'alimentacao',
    'transporte',
    'lazer',
    'saude',
    'educacao',
    'contas_fixas',
    'outros',
];

const statuses = ['paga', 'pendente', 'atrasada'];

const form = reactive({
    description: '',
    amount: '',
    date: today,
    category: 'moradia',
    status: 'pendente',
    notes: '',
});

const filters = reactive({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
});

const expenses = ref([]);
const totalAmount = ref(0);
const loading = ref(false);
const message = ref('');
const error = ref('');
const editingId = ref(null);

const resetForm = () => {
    form.description = '';
    form.amount = '';
    form.date = today;
    form.category = 'moradia';
    form.status = 'pendente';
    form.notes = '';
    editingId.value = null;
};

const loadExpenses = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/expenses', {
            params: {
                month: filters.month,
                year: filters.year,
            },
        });

        expenses.value = data.data;
        totalAmount.value = data.meta.total_amount;
    } catch {
        error.value = 'Falha ao carregar despesas.';
    } finally {
        loading.value = false;
    }
};

const saveExpense = async () => {
    message.value = '';
    error.value = '';

    const payload = {
        ...form,
        amount: Number(form.amount),
    };

    try {
        if (editingId.value) {
            await api.put(`/expenses/${editingId.value}`, payload);
            message.value = 'Despesa atualizada com sucesso.';
        } else {
            await api.post('/expenses', payload);
            message.value = 'Despesa cadastrada com sucesso.';
        }

        resetForm();
        await loadExpenses();
    } catch (requestError) {
        error.value = requestError?.response?.data?.message || 'Não foi possível salvar a despesa.';
    }
};

const editExpense = (expense) => {
    editingId.value = expense.id;
    form.description = expense.description;
    form.amount = expense.amount;
    form.date = toDateInputValue(expense.date);
    form.category = expense.category;
    form.status = expense.status;
    form.notes = expense.notes || '';
};

const removeExpense = async (expense) => {
    const confirmed = window.confirm(`Remover a despesa "${expense.description}"?`);
    if (!confirmed) {
        return;
    }

    await api.delete(`/expenses/${expense.id}`);
    await loadExpenses();
};

onMounted(loadExpenses);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Despesas</h2>
                <p>Gerencie saídas com categoria e status de pagamento.</p>
            </div>
            <div class="filters">
                <label>
                    Mês
                    <input v-model.number="filters.month" type="number" min="1" max="12" />
                </label>
                <label>
                    Ano
                    <input v-model.number="filters.year" type="number" min="2000" max="2100" />
                </label>
                <button class="btn-primary" type="button" @click="loadExpenses" :disabled="loading">
                    Filtrar
                </button>
            </div>
        </header>

        <div class="split-grid">
            <article class="panel">
                <h3>{{ editingId ? 'Editar Despesa' : 'Nova Despesa' }}</h3>
                <form class="form-grid" @submit.prevent="saveExpense">
                    <label>
                        Descrição
                        <input v-model="form.description" type="text" required />
                    </label>
                    <label>
                        Valor
                        <input v-model="form.amount" type="number" step="0.01" min="0.01" required />
                    </label>
                    <label>
                        Data
                        <input v-model="form.date" type="date" required />
                    </label>
                    <label>
                        Categoria
                        <select v-model="form.category" required>
                            <option v-for="category in categories" :key="category" :value="category">
                                {{ category }}
                            </option>
                        </select>
                    </label>
                    <label>
                        Status
                        <select v-model="form.status" required>
                            <option v-for="status in statuses" :key="status" :value="status">
                                {{ status }}
                            </option>
                        </select>
                    </label>
                    <label class="full">
                        Observação
                        <textarea v-model="form.notes" rows="3" />
                    </label>
                    <div class="actions">
                        <button class="btn-primary" type="submit">
                            {{ editingId ? 'Atualizar' : 'Salvar' }}
                        </button>
                        <button class="btn-ghost" type="button" @click="resetForm">Limpar</button>
                    </div>
                </form>
            </article>

            <article class="panel">
                <div class="panel-title">
                    <h3>Lista de Despesas</h3>
                    <strong>{{ formatCurrency(totalAmount) }}</strong>
                </div>

                <p v-if="message" class="success-text">{{ message }}</p>
                <p v-if="error" class="error-text">{{ error }}</p>

                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Descrição</th>
                                <th>Valor</th>
                                <th>Data</th>
                                <th>Categoria</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="expense in expenses" :key="expense.id">
                                <td>{{ expense.description }}</td>
                                <td>{{ formatCurrency(expense.amount) }}</td>
                                <td>{{ formatDate(expense.date) }}</td>
                                <td>{{ expense.category }}</td>
                                <td>{{ expense.status }}</td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editExpense(expense)">Editar</button>
                                    <button class="btn-link danger" @click="removeExpense(expense)">Excluir</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>
        </div>
    </section>
</template>
