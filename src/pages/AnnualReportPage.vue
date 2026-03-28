<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, monthName } from '@/utils/formatters';

Chart.register(...registerables);

const year = ref(new Date().getFullYear());
const rows = ref([]);
const totals = ref({
    income_total: 0,
    expense_total: 0,
    balance: 0,
});
const loading = ref(false);
const error = ref('');
const annualCanvas = ref(null);

let annualChart = null;

const positiveMonths = computed(() => rows.value.filter((row) => Number(row.balance || 0) >= 0).length);

const bestMonth = computed(() => {
    if (!rows.value.length) return null;
    return [...rows.value].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))[0];
});

const worstMonth = computed(() => {
    if (!rows.value.length) return null;
    return [...rows.value].sort((a, b) => Number(a.balance || 0) - Number(b.balance || 0))[0];
});

const renderAnnualChart = () => {
    if (!annualCanvas.value) return;
    if (annualChart) annualChart.destroy();

    const labels = rows.value.map((row) => monthName(row.month).slice(0, 3));
    const incomeData = rows.value.map((row) => Number(row.income_total || 0));
    const expenseData = rows.value.map((row) => Number(row.expense_total || 0));
    const accumulatedData = rows.value.map((row) => Number(row.accumulated_balance || 0));

    annualChart = new Chart(annualCanvas.value, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Receitas',
                    data: incomeData,
                    borderColor: '#1f7a8c',
                    backgroundColor: 'rgba(31, 122, 140, 0.12)',
                    fill: true,
                    tension: 0.33,
                    pointRadius: 3,
                },
                {
                    label: 'Despesas',
                    data: expenseData,
                    borderColor: '#bf4342',
                    backgroundColor: 'rgba(191, 67, 66, 0.11)',
                    fill: true,
                    tension: 0.33,
                    pointRadius: 3,
                },
                {
                    label: 'Saldo acumulado',
                    data: accumulatedData,
                    borderColor: '#2a9d5f',
                    backgroundColor: 'rgba(42, 157, 95, 0.15)',
                    fill: false,
                    tension: 0.28,
                    pointRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y || 0)}`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    ticks: {
                        callback: (value) => formatCurrency(value),
                    },
                },
            },
        },
    });
};

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

        await nextTick();
        renderAnnualChart();
    } catch {
        error.value = 'Nao foi possivel carregar o relatorio anual.';
    } finally {
        loading.value = false;
    }
};

onMounted(loadReport);

onBeforeUnmount(() => {
    if (annualChart) annualChart.destroy();
});
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Visao Anual</h2>
                <p>Consolidacao completa de receitas, despesas e saldo acumulado.</p>
            </div>
            <div class="filters">
                <label>
                    Ano
                    <input v-model.number="year" type="number" min="2000" max="2100" />
                </label>
                <button class="btn-primary" type="button" @click="loadReport" :disabled="loading">
                    <AppIcon name="refresh" :size="15" />
                    <span>{{ loading ? 'Atualizando...' : 'Atualizar' }}</span>
                </button>
            </div>
        </header>

        <p v-if="error" class="error-text">{{ error }}</p>
        <div v-if="loading && !rows.length" class="panel panel-loading">Carregando consolidacao anual...</div>

        <div class="cards-grid annual-metrics-grid">
            <article class="metric-card">
                <h3>Total anual de receitas</h3>
                <strong>{{ formatCurrency(totals.income_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Total anual de despesas</h3>
                <strong>{{ formatCurrency(totals.expense_total) }}</strong>
            </article>
            <article class="metric-card" :class="Number(totals.balance) >= 0 ? 'tone-positive' : 'tone-danger'">
                <h3>Saldo anual</h3>
                <strong>{{ formatCurrency(totals.balance) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Meses positivos</h3>
                <strong>{{ positiveMonths }}/12</strong>
            </article>
            <article class="metric-card" v-if="bestMonth">
                <h3>Melhor mes</h3>
                <strong>{{ monthName(bestMonth.month) }}</strong>
                <small>{{ formatCurrency(bestMonth.balance) }}</small>
            </article>
            <article class="metric-card" v-if="worstMonth">
                <h3>Mes de alerta</h3>
                <strong>{{ monthName(worstMonth.month) }}</strong>
                <small>{{ formatCurrency(worstMonth.balance) }}</small>
            </article>
        </div>

        <article class="chart-card">
            <h3>Tendencia Anual</h3>
            <p class="hint-text">Comparativo de receitas, despesas e saldo acumulado.</p>
            <div class="chart-holder annual-chart-holder">
                <canvas ref="annualCanvas" />
            </div>
        </article>

        <article class="panel">
            <h3>Resumo mes a mes</h3>
            <div class="table-wrap">
                <table v-if="rows.length">
                    <thead>
                        <tr>
                            <th>Mes</th>
                            <th>Receitas</th>
                            <th>Despesas</th>
                            <th>Saldo</th>
                            <th>Saldo Acumulado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="row in rows"
                            :key="row.month"
                            :class="Number(row.balance || 0) < 0 ? 'table-row-negative' : ''"
                        >
                            <td>{{ monthName(row.month) }}</td>
                            <td>{{ formatCurrency(row.income_total) }}</td>
                            <td>{{ formatCurrency(row.expense_total) }}</td>
                            <td>{{ formatCurrency(row.balance) }}</td>
                            <td>{{ formatCurrency(row.accumulated_balance) }}</td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty-state">
                    <AppIcon :name="loading ? 'refresh' : 'annual'" :size="19" />
                    <p v-if="loading">Carregando dados anuais...</p>
                    <p v-else>Nenhum dado anual encontrado.</p>
                </div>
            </div>
        </article>
    </section>
</template>
