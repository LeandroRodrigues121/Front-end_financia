<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { humanizeLabel, incomeTypeLabel, monthOptions } from '@/utils/labels';

const today = new Date().toISOString().slice(0, 10);

const incomeTypes = [
    { value: 'salario', label: 'Salario' },
    { value: 'renda_extra', label: 'Renda extra' },
    { value: 'rendimento_investimento', label: 'Rendimento de investimento' },
    { value: 'outros', label: 'Outros' },
];

const sortOptions = [
    { value: 'date_desc', label: 'Data (mais recente)' },
    { value: 'date_asc', label: 'Data (mais antiga)' },
    { value: 'amount_desc', label: 'Valor (maior)' },
    { value: 'amount_asc', label: 'Valor (menor)' },
    { value: 'description_asc', label: 'Descricao (A-Z)' },
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
const formError = ref('');
const editingId = ref(null);
const searchQuery = ref('');
const sortBy = ref('date_desc');

const resetForm = () => {
    form.description = '';
    form.amount = '';
    form.date = today;
    form.category = '';
    form.type = 'salario';
    form.notes = '';
    formError.value = '';
    editingId.value = null;
};

const filteredIncomes = computed(() => {
    let rows = [...incomes.value];

    if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase();
        rows = rows.filter((income) =>
            [income.description, income.category, income.type, income.notes]
                .map((value) => String(value || '').toLowerCase())
                .some((value) => value.includes(query)),
        );
    }

    rows.sort((a, b) => {
        if (sortBy.value === 'date_asc') return new Date(a.date) - new Date(b.date);
        if (sortBy.value === 'amount_desc') return Number(b.amount) - Number(a.amount);
        if (sortBy.value === 'amount_asc') return Number(a.amount) - Number(b.amount);
        if (sortBy.value === 'description_asc') return String(a.description).localeCompare(String(b.description));
        return new Date(b.date) - new Date(a.date);
    });

    return rows;
});

const validateForm = () => {
    if (!String(form.description).trim()) {
        formError.value = 'Informe a descricao da receita.';
        return false;
    }

    if (Number(form.amount) <= 0) {
        formError.value = 'O valor da receita deve ser maior que zero.';
        return false;
    }

    if (!form.date) {
        formError.value = 'Informe a data da receita.';
        return false;
    }

    if (!String(form.category).trim()) {
        formError.value = 'Informe uma categoria.';
        return false;
    }

    formError.value = '';
    return true;
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
        totalAmount.value = Number(data.meta.total_amount || 0);
    } catch {
        error.value = 'Falha ao carregar receitas.';
    } finally {
        loading.value = false;
    }
};

const saveIncome = async () => {
    message.value = '';
    error.value = '';
    if (!validateForm()) return;

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
        error.value = requestError?.response?.data?.message || 'Nao foi possivel salvar a receita.';
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
    formError.value = '';
};

const removeIncome = async (income) => {
    const confirmed = window.confirm(`Remover a receita "${income.description}"?`);
    if (!confirmed) return;

    message.value = '';
    error.value = '';

    try {
        await api.delete(`/incomes/${income.id}`);
        message.value = 'Receita removida com sucesso.';
        await loadIncomes();
    } catch {
        error.value = 'Nao foi possivel remover a receita.';
    }
};

onMounted(loadIncomes);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Receitas</h2>
                <p>Lance entradas e acompanhe o resultado por periodo.</p>
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
                <button class="btn-primary" type="button" @click="loadIncomes" :disabled="loading">
                    <AppIcon name="filter" :size="15" />
                    <span>{{ loading ? 'Filtrando...' : 'Filtrar' }}</span>
                </button>
            </div>
        </header>

        <div class="split-grid">
            <article class="panel">
                <h3>{{ editingId ? 'Editar Receita' : 'Nova Receita' }}</h3>
                <form class="form-grid" @submit.prevent="saveIncome">
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
                    <h3>Lista de Receitas</h3>
                    <strong>{{ formatCurrency(totalAmount) }}</strong>
                </div>

                <p v-if="message" class="success-text">{{ message }}</p>
                <p v-if="error" class="error-text">{{ error }}</p>

                <div class="table-toolbar">
                    <label class="table-search">
                        Buscar
                        <div class="search-field">
                            <AppIcon name="search" :size="14" />
                            <input v-model="searchQuery" type="text" placeholder="Descricao, categoria, tipo..." />
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
                    <table v-if="filteredIncomes.length">
                        <thead>
                            <tr>
                                <th>Descricao</th>
                                <th>Valor</th>
                                <th>Data</th>
                                <th>Categoria</th>
                                <th>Tipo</th>
                                <th>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="income in filteredIncomes" :key="income.id">
                                <td>{{ income.description }}</td>
                                <td>{{ formatCurrency(income.amount) }}</td>
                                <td>{{ formatDate(income.date) }}</td>
                                <td>{{ humanizeLabel(income.category) }}</td>
                                <td>
                                    <span class="status-pill tone-neutral">{{ incomeTypeLabel(income.type) }}</span>
                                </td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editIncome(income)">
                                        <AppIcon name="edit" :size="14" />
                                        <span>Editar</span>
                                    </button>
                                    <button class="btn-link danger" @click="removeIncome(income)">
                                        <AppIcon name="delete" :size="14" />
                                        <span>Excluir</span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-else class="empty-state">
                        <AppIcon :name="loading ? 'refresh' : 'incomes'" :size="19" />
                        <p v-if="loading">Carregando receitas...</p>
                        <p v-else>Nenhuma receita encontrada para os filtros atuais.</p>
                    </div>
                </div>
            </article>
        </div>
    </section>
</template>
