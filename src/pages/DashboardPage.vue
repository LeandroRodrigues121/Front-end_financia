<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '@/services/api';
import { formatCurrency, monthName } from '@/utils/formatters';

const doughnutPercentagePlugin = {
    id: 'doughnutPercentagePlugin',
    afterDatasetsDraw(chart) {
        if (chart.config.type !== 'doughnut') {
            return;
        }

        const isEnabled = chart.options?.plugins?.doughnutPercentage?.enabled !== false;
        if (!isEnabled) {
            return;
        }

        const dataset = chart.data?.datasets?.[0];
        if (!dataset) {
            return;
        }

        const values = dataset.data.map((value) => Number(value || 0));
        const total = values.reduce((sum, value) => sum + value, 0);

        if (total <= 0) {
            return;
        }

        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);

        ctx.save();
        ctx.font = '700 12px Manrope, sans-serif';
        ctx.fillStyle = '#132019';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        meta.data.forEach((arc, index) => {
            const value = values[index] || 0;
            if (value <= 0) {
                return;
            }

            const percentage = (value / total) * 100;
            if (percentage < 4) {
                return;
            }

            const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
                ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
                true,
            );

            const angle = (startAngle + endAngle) / 2;
            const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
            const labelX = x + Math.cos(angle) * radius;
            const labelY = y + Math.sin(angle) * radius;

            ctx.fillText(`${Math.round(percentage)}%`, labelX, labelY);
        });

        ctx.restore();
    },
};

Chart.register(...registerables, doughnutPercentagePlugin);

const currentDate = new Date();
const filters = reactive({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear(),
});

const dashboard = ref(null);
const loading = ref(false);
const error = ref('');
const incomeExpenseCanvas = ref(null);
const categoryCanvas = ref(null);
const trendLineCanvas = ref(null);

let incomeExpenseChart = null;
let categoryChart = null;
let trendLineChart = null;

const months = [...Array(12)].map((_, index) => ({
    value: index + 1,
    label: monthName(index + 1),
}));

const balanceValueClass = (value) => ({
    'metric-value-positive': Number(value) > 0,
    'metric-value-negative': Number(value) < 0,
});

const commitmentValueClass = (value) => ({
    'metric-value-negative': Number(value) > 70,
    'metric-value-positive': Number(value) <= 70,
});

const fetchDashboard = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/dashboard', {
            params: {
                month: filters.month,
                year: filters.year,
            },
        });

        dashboard.value = data;
        await nextTick();
        renderCharts();
    } catch {
        error.value = 'Nao foi possivel carregar o dashboard.';
    } finally {
        loading.value = false;
    }
};

const renderCharts = () => {
    if (!dashboard.value) {
        return;
    }

    if (!incomeExpenseCanvas.value || !categoryCanvas.value || !trendLineCanvas.value) {
        return;
    }

    if (incomeExpenseChart) {
        incomeExpenseChart.destroy();
    }

    if (categoryChart) {
        categoryChart.destroy();
    }

    if (trendLineChart) {
        trendLineChart.destroy();
    }

    const monthlyLabels = dashboard.value.charts.income_vs_expense_by_month.labels;
    const monthlyIncomes = dashboard.value.charts.income_vs_expense_by_month.incomes;
    const monthlyExpenses = dashboard.value.charts.income_vs_expense_by_month.expenses;

    incomeExpenseChart = new Chart(incomeExpenseCanvas.value, {
        type: 'bar',
        data: {
            labels: monthlyLabels,
            datasets: [
                {
                    label: 'Receitas',
                    data: monthlyIncomes,
                    backgroundColor: '#1f7a8c',
                    borderRadius: 8,
                },
                {
                    label: 'Despesas',
                    data: monthlyExpenses,
                    backgroundColor: '#bf4342',
                    borderRadius: 8,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
            },
        },
    });

    const categoryValues = [...dashboard.value.charts.expenses_by_category.values];
    const categoryLabels = [...dashboard.value.charts.expenses_by_category.labels];
    const hasCategoryData = categoryValues.length > 0;
    const useRightLegend = window.innerWidth > 1200;

    categoryChart = new Chart(categoryCanvas.value, {
        type: 'doughnut',
        data: {
            labels: hasCategoryData ? categoryLabels : ['Sem despesas no periodo'],
            datasets: [
                {
                    data: hasCategoryData ? categoryValues : [1],
                    backgroundColor: [
                        '#1f7a8c',
                        '#bf4342',
                        '#f7b32b',
                        '#3a7d44',
                        '#5f0f40',
                        '#0d3b66',
                        '#f4a261',
                        '#9d4edd',
                    ],
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
                legend: {
                    position: useRightLegend ? 'right' : 'bottom',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 14,
                        boxWidth: 10,
                        boxHeight: 10,
                        color: '#45534b',
                        font: {
                            family: 'Manrope',
                            size: 12,
                            weight: '600',
                        },
                    },
                },
                doughnutPercentage: {
                    enabled: hasCategoryData,
                },
            },
        },
    });

    trendLineChart = new Chart(trendLineCanvas.value, {
        type: 'line',
        data: {
            labels: monthlyLabels,
            datasets: [
                {
                    label: 'Receitas',
                    data: monthlyIncomes,
                    borderColor: '#1f7a8c',
                    backgroundColor: 'rgba(31, 122, 140, 0.15)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#1f7a8c',
                },
                {
                    label: 'Despesas',
                    data: monthlyExpenses,
                    borderColor: '#bf4342',
                    backgroundColor: 'rgba(191, 67, 66, 0.12)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#bf4342',
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
                    position: 'top',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `R$ ${Number(value).toLocaleString('pt-BR')}`,
                    },
                },
            },
        },
    });
};

onMounted(fetchDashboard);

onBeforeUnmount(() => {
    if (incomeExpenseChart) {
        incomeExpenseChart.destroy();
    }
    if (categoryChart) {
        categoryChart.destroy();
    }
    if (trendLineChart) {
        trendLineChart.destroy();
    }
});
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Dashboard Financeiro</h2>
                <p>Visao mensal e anual com indicadores estrategicos.</p>
            </div>

            <div class="filters">
                <label>
                    Mes
                    <select v-model.number="filters.month">
                        <option v-for="month in months" :key="month.value" :value="month.value">
                            {{ month.label }}
                        </option>
                    </select>
                </label>
                <label>
                    Ano
                    <input v-model.number="filters.year" type="number" min="2000" max="2100" />
                </label>
                <button class="btn-primary" type="button" @click="fetchDashboard" :disabled="loading">
                    Atualizar
                </button>
            </div>
        </header>

        <p class="error-text" v-if="error">{{ error }}</p>

        <div class="cards-grid dashboard-cards-grid" v-if="dashboard">
            <article class="metric-card">
                <h3>Receitas do mes</h3>
                <strong>{{ formatCurrency(dashboard.monthly.income_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Despesas do mes</h3>
                <strong>{{ formatCurrency(dashboard.monthly.expense_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Saldo do mes</h3>
                <strong :class="balanceValueClass(dashboard.monthly.balance)">
                    {{ formatCurrency(dashboard.monthly.balance) }}
                </strong>
            </article>
            <article class="metric-card">
                <h3>Receitas do ano</h3>
                <strong>{{ formatCurrency(dashboard.annual.income_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Despesas do ano</h3>
                <strong>{{ formatCurrency(dashboard.annual.expense_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Saldo anual</h3>
                <strong>{{ formatCurrency(dashboard.annual.balance) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Comprometimento do mes</h3>
                <strong :class="commitmentValueClass(dashboard.indicators.expense_commitment_percent)">
                    {{ dashboard.indicators.expense_commitment_percent }}%
                </strong>
            </article>
            <article class="metric-card">
                <h3>Dividas em aberto</h3>
                <strong>{{ formatCurrency(dashboard.indicators.open_debt_total) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Dividas pagas</h3>
                <strong>{{ formatCurrency(dashboard.indicators.paid_debt_total) }}</strong>
            </article>
        </div>

        <div class="charts-grid" v-if="dashboard">
            <article class="chart-card">
                <h3>Receitas vs Despesas por Mes</h3>
                <div class="chart-holder">
                    <canvas ref="incomeExpenseCanvas" />
                </div>
            </article>

            <article class="chart-card">
                <h3>Despesas por Categoria no Mes</h3>
                <div class="chart-holder">
                    <canvas ref="categoryCanvas" />
                </div>
            </article>
        </div>

        <article class="chart-card chart-card-full" v-if="dashboard">
            <h3>Tendencia de Receitas x Despesas no Ano</h3>
            <div class="chart-holder chart-holder-line">
                <canvas ref="trendLineCanvas" />
            </div>
        </article>
    </section>
</template>
