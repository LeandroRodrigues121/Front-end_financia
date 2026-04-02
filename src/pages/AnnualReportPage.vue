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
    const context = annualCanvas.value.getContext('2d');
    const incomeGradient = context.createLinearGradient(0, 0, 0, 340);
    incomeGradient.addColorStop(0, 'rgba(77, 170, 195, 0.45)');
    incomeGradient.addColorStop(1, 'rgba(77, 170, 195, 0.05)');

    const expenseGradient = context.createLinearGradient(0, 0, 0, 340);
    expenseGradient.addColorStop(0, 'rgba(239, 114, 72, 0.42)');
    expenseGradient.addColorStop(1, 'rgba(239, 114, 72, 0.05)');

    const accumulatedGradient = context.createLinearGradient(0, 0, 0, 340);
    accumulatedGradient.addColorStop(0, 'rgba(234, 178, 63, 0.4)');
    accumulatedGradient.addColorStop(1, 'rgba(234, 178, 63, 0.06)');

    annualChart = new Chart(annualCanvas.value, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Despesas',
                    data: expenseData,
                    borderColor: '#ef7248',
                    backgroundColor: expenseGradient,
                    fill: true,
                    stack: 'annual',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 3,
                    cubicInterpolationMode: 'monotone',
                },
                {
                    label: 'Receitas',
                    data: incomeData,
                    borderColor: '#4daac3',
                    backgroundColor: incomeGradient,
                    fill: true,
                    stack: 'annual',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 3,
                    cubicInterpolationMode: 'monotone',
                },
                {
                    label: 'Saldo acumulado',
                    data: accumulatedData,
                    borderColor: '#eab23f',
                    backgroundColor: accumulatedGradient,
                    fill: true,
                    stack: 'annual',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 3,
                    cubicInterpolationMode: 'monotone',
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
                legend: {
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 14,
                    },
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y || 0)}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(84, 104, 93, 0.16)',
                        borderDash: [4, 4],
                    },
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(84, 104, 93, 0.16)',
                        borderDash: [4, 4],
                    },
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
        error.value = 'Não foi possível carregar o relatório anual.';
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
                <h2>Visão Anual</h2>
                <p>Consolidação completa de receitas, despesas e saldo acumulado.</p>
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
        <div v-if="loading && !rows.length" class="panel panel-loading">Carregando consolidação anual...</div>

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
                <h3>Melhor mês</h3>
                <strong>{{ monthName(bestMonth.month) }}</strong>
                <small>{{ formatCurrency(bestMonth.balance) }}</small>
            </article>
            <article class="metric-card" v-if="worstMonth">
                <h3>Mês de alerta</h3>
                <strong>{{ monthName(worstMonth.month) }}</strong>
                <small>{{ formatCurrency(worstMonth.balance) }}</small>
            </article>
        </div>

        <article class="chart-card">
            <h3>Tendência Anual</h3>
            <p class="hint-text">Comparativo de receitas, despesas e saldo acumulado.</p>
            <div class="chart-holder annual-chart-holder">
                <canvas ref="annualCanvas" />
            </div>
        </article>

        <article class="panel">
            <h3>Resumo mês a mês</h3>
            <div class="table-wrap">
                <table v-if="rows.length">
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
