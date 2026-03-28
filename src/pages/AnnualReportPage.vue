<script setup>
import { onMounted, ref } from 'vue';
import api from '@/services/api';
import { formatCurrency, monthName } from '@/utils/formatters';

const year = ref(new Date().getFullYear());
const rows = ref([]);
const totals = ref({
    income_total: 0,
    expense_total: 0,
    balance: 0,
});
const loading = ref(false);
const error = ref('');

const loadReport = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/reports/annual', {
            params: {
                year: year.value,
            },
        });

        rows.value = data.rows;
        totals.value = data.totals;
    } catch {
        error.value = 'Não foi possível carregar o relatório anual.';
    } finally {
        loading.value = false;
    }
};

onMounted(loadReport);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Visão Anual</h2>
                <p>Consolidação completa de receitas, despesas e saldo acumulado.</p>
            </div>
            <div class="filters">
                <label>
                    Ano
                    <input v-model.number="year" type="number" min="2000" max="2100" />
                </label>
                <button class="btn-primary" type="button" @click="loadReport" :disabled="loading">
                    Atualizar
                </button>
            </div>
        </header>

        <p v-if="error" class="error-text">{{ error }}</p>

        <div class="cards-grid">
            <article class="metric-card">
                <h3>Total anual de receitas</h3>
                <strong>{{ formatCurrency(totals.income_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Total anual de despesas</h3>
                <strong>{{ formatCurrency(totals.expense_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Saldo anual</h3>
                <strong>{{ formatCurrency(totals.balance) }}</strong>
            </article>
        </div>

        <article class="panel">
            <h3>Resumo mês a mês</h3>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Mês</th>
                            <th>Receitas</th>
                            <th>Despesas</th>
                            <th>Saldo</th>
                            <th>Saldo Acumulado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in rows" :key="row.month">
                            <td>{{ monthName(row.month) }}</td>
                            <td>{{ formatCurrency(row.income_total) }}</td>
                            <td>{{ formatCurrency(row.expense_total) }}</td>
                            <td>{{ formatCurrency(row.balance) }}</td>
                            <td>{{ formatCurrency(row.accumulated_balance) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </article>
    </section>
</template>
