<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { expenseCategoryLabel, monthOptions, statusLabel, statusTone } from '@/utils/labels';

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

const sortOptions = [
    { value: 'date_desc', label: 'Data (mais recente)' },
    { value: 'date_asc', label: 'Data (mais antiga)' },
    { value: 'amount_desc', label: 'Valor (maior)' },
    { value: 'amount_asc', label: 'Valor (menor)' },
    { value: 'status_asc', label: 'Status' },
];

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
const formError = ref('');
const editingId = ref(null);
const searchQuery = ref('');
const sortBy = ref('date_desc');

const resetForm = () => {
    form.description = '';
    form.amount = '';
    form.date = today;
    form.category = 'moradia';
    form.status = 'pendente';
    form.notes = '';
    formError.value = '';
    editingId.value = null;
};

const filteredExpenses = computed(() => {
    let rows = [...expenses.value];

    if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase();
        rows = rows.filter((expense) =>
            [expense.description, expense.category, expense.status, expense.notes]
                .map((value) => String(value || '').toLowerCase())
                .some((value) => value.includes(query)),
        );
    }

    rows.sort((a, b) => {
        if (sortBy.value === 'date_asc') return new Date(a.date) - new Date(b.date);
        if (sortBy.value === 'amount_desc') return Number(b.amount) - Number(a.amount);
        if (sortBy.value === 'amount_asc') return Number(a.amount) - Number(b.amount);
        if (sortBy.value === 'status_asc') return String(a.status).localeCompare(String(b.status));
        return new Date(b.date) - new Date(a.date);
    });

    return rows;
});

const validateForm = () => {
    if (!String(form.description).trim()) {
        formError.value = 'Informe a descricao da despesa.';
        return false;
    }

    if (Number(form.amount) <= 0) {
        formError.value = 'O valor da despesa deve ser maior que zero.';
        return false;
    }

    if (!form.date) {
        formError.value = 'Informe a data da despesa.';
        return false;
    }

    formError.value = '';
    return true;
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
        totalAmount.value = Number(data.meta.total_amount || 0);
    } catch {
        error.value = 'Falha ao carregar despesas.';
    } finally {
        loading.value = false;
    }
};

const saveExpense = async () => {
    message.value = '';
    error.value = '';

    if (!validateForm()) return;

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
        error.value = requestError?.response?.data?.message || 'Nao foi possivel salvar a despesa.';
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
    formError.value = '';
};

const removeExpense = async (expense) => {
    const confirmed = window.confirm(`Remover a despesa "${expense.description}"?`);
    if (!confirmed) return;

    message.value = '';
    error.value = '';

    try {
        await api.delete(`/expenses/${expense.id}`);
        message.value = 'Despesa removida com sucesso.';
        await loadExpenses();
    } catch {
        error.value = 'Nao foi possivel remover a despesa.';
    }
};

onMounted(loadExpenses);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Despesas</h2>
                <p>Gerencie saidas com categoria, status e filtros rapidos.</p>
            </div>
            <div class="filters">
                <label>
                    Mes
                    <select v-model.number="filters.month">
                        <option v-for="month in monthOptions" :key="month.value" :value="month.value">
                            {{ month.label }}
                        </option>
                    </select>
                </label>
                <label>
                    Ano
                    <input v-model.number="filters.year" type="number" min="2000" max="2100" />
                </label>
                <button class="btn-primary" type="button" @click="loadExpenses" :disabled="loading">
                    <AppIcon name="filter" :size="15" />
                    <span>{{ loading ? 'Filtrando...' : 'Filtrar' }}</span>
                </button>
            </div>
        </header>

        <div class="split-grid">
            <article class="panel">
                <h3>{{ editingId ? 'Editar Despesa' : 'Nova Despesa' }}</h3>
                <form class="form-grid" @submit.prevent="saveExpense">
                    <label>
                        Descricao
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
                                {{ expenseCategoryLabel(category) }}
                            </option>
                        </select>
                    </label>
                    <label>
                        Status
                        <select v-model="form.status" required>
                            <option v-for="status in statuses" :key="status" :value="status">
                                {{ statusLabel(status) }}
                            </option>
                        </select>
                    </label>
                    <label class="full">
                        Observacao
                        <textarea v-model="form.notes" rows="3" />
                    </label>
                    <p v-if="formError" class="error-text full">{{ formError }}</p>
                    <div class="actions">
                        <button class="btn-primary" type="submit">
                            <AppIcon :name="editingId ? 'edit' : 'plus'" :size="15" />
                            <span>{{ editingId ? 'Atualizar' : 'Salvar' }}</span>
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

                <div class="table-toolbar">
                    <label class="table-search">
                        Buscar
                        <div class="search-field">
                            <AppIcon name="search" :size="14" />
                            <input
                                v-model="searchQuery"
                                type="text"
                                placeholder="Descricao, categoria, status..."
                            />
                        </div>
                    </label>
                    <label>
                        Ordenacao
                        <select v-model="sortBy">
                            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </label>
                </div>

                <div class="table-wrap">
                    <table v-if="filteredExpenses.length">
                        <thead>
                            <tr>
                                <th>Descricao</th>
                                <th>Valor</th>
                                <th>Data</th>
                                <th>Categoria</th>
                                <th>Status</th>
                                <th>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="expense in filteredExpenses" :key="expense.id">
                                <td>{{ expense.description }}</td>
                                <td>{{ formatCurrency(expense.amount) }}</td>
                                <td>{{ formatDate(expense.date) }}</td>
                                <td>{{ expenseCategoryLabel(expense.category) }}</td>
                                <td>
                                    <span class="status-pill" :class="`tone-${statusTone(expense.status)}`">
                                        {{ statusLabel(expense.status) }}
                                    </span>
                                </td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editExpense(expense)">
                                        <AppIcon name="edit" :size="14" />
                                        <span>Editar</span>
                                    </button>
                                    <button class="btn-link danger" @click="removeExpense(expense)">
                                        <AppIcon name="delete" :size="14" />
                                        <span>Excluir</span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-else class="empty-state">
                        <AppIcon :name="loading ? 'refresh' : 'expenses'" :size="19" />
                        <p v-if="loading">Carregando despesas...</p>
                        <p v-else>Nenhuma despesa encontrada para os filtros atuais.</p>
                    </div>
                </div>
            </article>
        </div>
    </section>
</template>
