<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';

const today = new Date().toISOString().slice(0, 10);

const incomeTypes = [
    { value: 'salario', label: 'Salário' },
    { value: 'renda_extra', label: 'Renda extra' },
    { value: 'rendimento_investimento', label: 'Rendimento de investimento' },
    { value: 'outros', label: 'Outros' },
];

const form = reactive({
    description: '',
    amount: '',
    date: today,
    category: '',
    type: 'salario',
    notes: '',
});

const filters = reactive({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
});

const incomes = ref([]);
const totalAmount = ref(0);
const loading = ref(false);
const message = ref('');
const error = ref('');
const editingId = ref(null);

const resetForm = () => {
    form.description = '';
    form.amount = '';
    form.date = today;
    form.category = '';
    form.type = 'salario';
    form.notes = '';
    editingId.value = null;
};

const loadIncomes = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/incomes', {
            params: {
                month: filters.month,
                year: filters.year,
            },
        });

        incomes.value = data.data;
        totalAmount.value = data.meta.total_amount;
    } catch {
        error.value = 'Falha ao carregar receitas.';
    } finally {
        loading.value = false;
    }
};

const saveIncome = async () => {
    message.value = '';
    error.value = '';

    const payload = {
        ...form,
        amount: Number(form.amount),
    };

    try {
        if (editingId.value) {
            await api.put(`/incomes/${editingId.value}`, payload);
            message.value = 'Receita atualizada com sucesso.';
        } else {
            await api.post('/incomes', payload);
            message.value = 'Receita cadastrada com sucesso.';
        }

        resetForm();
        await loadIncomes();
    } catch (requestError) {
        error.value = requestError?.response?.data?.message || 'Não foi possível salvar a receita.';
    }
};

const editIncome = (income) => {
    editingId.value = income.id;
    form.description = income.description;
    form.amount = income.amount;
    form.date = toDateInputValue(income.date);
    form.category = income.category;
    form.type = income.type;
    form.notes = income.notes || '';
};

const removeIncome = async (income) => {
    const confirmed = window.confirm(`Remover a receita "${income.description}"?`);
    if (!confirmed) {
        return;
    }

    await api.delete(`/incomes/${income.id}`);
    await loadIncomes();
};

onMounted(loadIncomes);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Receitas</h2>
                <p>Lance todas as entradas e acompanhe por período.</p>
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
                <button class="btn-primary" type="button" @click="loadIncomes" :disabled="loading">
                    Filtrar
                </button>
            </div>
        </header>

        <div class="split-grid">
            <article class="panel">
                <h3>{{ editingId ? 'Editar Receita' : 'Nova Receita' }}</h3>
                <form class="form-grid" @submit.prevent="saveIncome">
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
                        <input v-model="form.category" type="text" placeholder="Ex.: Trabalho" required />
                    </label>
                    <label>
                        Tipo
                        <select v-model="form.type" required>
                            <option v-for="type in incomeTypes" :key="type.value" :value="type.value">
                                {{ type.label }}
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
                    <h3>Lista de Receitas</h3>
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
                                <th>Tipo</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="income in incomes" :key="income.id">
                                <td>{{ income.description }}</td>
                                <td>{{ formatCurrency(income.amount) }}</td>
                                <td>{{ formatDate(income.date) }}</td>
                                <td>{{ income.category }}</td>
                                <td>{{ income.type }}</td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editIncome(income)">Editar</button>
                                    <button class="btn-link danger" @click="removeIncome(income)">Excluir</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>
        </div>
    </section>
</template>
