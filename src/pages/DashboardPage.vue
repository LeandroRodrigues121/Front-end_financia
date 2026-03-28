<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, monthName } from '@/utils/formatters';
import { expenseCategoryLabel, monthOptions } from '@/utils/labels';

const doughnutPercentagePlugin = {
    id: 'doughnutPercentagePlugin',
    afterDatasetsDraw(chart) {
        if (chart.config.type !== 'doughnut') return;

        const dataset = chart.data?.datasets?.[0];
        if (!dataset) return;

        const values = dataset.data.map((value) => Number(value || 0));
        const total = values.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return;

        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);

        ctx.save();
        ctx.font = '700 11px Manrope, sans-serif';
        ctx.fillStyle = '#10261a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        meta.data.forEach((arc, index) => {
            const value = values[index] || 0;
            if (value <= 0) return;

            const percentage = (value / total) * 100;
            if (percentage < 5) return;

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

const toNumber = (value) => Number(value || 0);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const trendDescriptor = (current, previous, { inverse = false } = {}) => {
    if (previous === null || previous === undefined) {
        return { tone: 'neutral', label: 'Sem base de comparacao', icon: 'progress' };
    }

    if (previous === 0 && current === 0) {
        return { tone: 'neutral', label: 'Sem variacao', icon: 'progress' };
    }

    const change = ((current - previous) / (Math.abs(previous) || 1)) * 100;
    const stable = Math.abs(change) < 0.01;
    if (stable) {
        return { tone: 'neutral', label: 'Sem variacao', icon: 'progress' };
    }

    const isBetter = inverse ? change < 0 : change > 0;
    const tone = isBetter ? 'positive' : 'danger';
    const direction = change > 0 ? 'Alta' : 'Queda';
    const percentage = `${Math.abs(change).toFixed(1).replace('.', ',')}%`;

    return {
        tone,
        label: `${direction} de ${percentage}`,
        icon: isBetter ? 'trendUp' : 'trendDown',
    };
};

const currentDate = new Date();
const filters = reactive({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear(),
});

const dashboard = ref(null);
const loading = ref(false);
const error = ref('');
const updatedAt = ref(null);
const incomeExpenseCanvas = ref(null);
const categoryCanvas = ref(null);
const trendLineCanvas = ref(null);

let incomeExpenseChart = null;
let categoryChart = null;
let trendLineChart = null;

const selectedMonthIndex = computed(() => Math.max(toNumber(filters.month) - 1, 0));
const previousMonthIndex = computed(() => (selectedMonthIndex.value > 0 ? selectedMonthIndex.value - 1 : null));
const previousMonthLabel = computed(() => {
    if (previousMonthIndex.value === null) return 'mes anterior';
    return monthName(previousMonthIndex.value + 1);
});

const incomeSeries = computed(
    () => dashboard.value?.charts?.income_vs_expense_by_month?.incomes?.map((value) => toNumber(value)) || [],
);
const expenseSeries = computed(
    () => dashboard.value?.charts?.income_vs_expense_by_month?.expenses?.map((value) => toNumber(value)) || [],
);
const hasAnyMovement = computed(
    () => incomeSeries.value.some((value) => value > 0) || expenseSeries.value.some((value) => value > 0),
);

const categoryChartData = computed(() => {
    const labels = dashboard.value?.charts?.expenses_by_category?.labels || [];
    const values = dashboard.value?.charts?.expenses_by_category?.values || [];

    return {
        labels: labels.map((item) => expenseCategoryLabel(item)),
        values: values.map((item) => toNumber(item)),
    };
});

const hasCategoryData = computed(() => categoryChartData.value.values.some((value) => value > 0));
const timeline = computed(() => dashboard.value?.monthly_balance_timeline || []);

const trendSummary = computed(() => {
    if (!dashboard.value) return null;

    const currentIncome = incomeSeries.value[selectedMonthIndex.value] || 0;
    const currentExpense = expenseSeries.value[selectedMonthIndex.value] || 0;
    const currentBalance = currentIncome - currentExpense;
    const previousIncome =
        previousMonthIndex.value === null ? null : incomeSeries.value[previousMonthIndex.value] || 0;
    const previousExpense =
        previousMonthIndex.value === null ? null : expenseSeries.value[previousMonthIndex.value] || 0;
    const previousBalance =
        previousIncome === null || previousExpense === null ? null : previousIncome - previousExpense;

    return {
        income: trendDescriptor(currentIncome, previousIncome),
        expense: trendDescriptor(currentExpense, previousExpense, { inverse: true }),
        balance: trendDescriptor(currentBalance, previousBalance),
    };
});

const kpiCards = computed(() => {
    if (!dashboard.value) return [];

    const monthly = dashboard.value.monthly;
    const annual = dashboard.value.annual;
    const indicators = dashboard.value.indicators;

    return [
        {
            id: 'monthly-income',
            title: 'Receitas do mes',
            icon: 'incomes',
            value: formatCurrency(monthly.income_total),
            tone: 'neutral',
            trend: trendSummary.value?.income,
            note: `Comparado com ${previousMonthLabel.value}`,
        },
        {
            id: 'monthly-expense',
            title: 'Despesas do mes',
            icon: 'expenses',
            value: formatCurrency(monthly.expense_total),
            tone: 'neutral',
            trend: trendSummary.value?.expense,
            note: `Comparado com ${previousMonthLabel.value}`,
        },
        {
            id: 'monthly-balance',
            title: 'Saldo do mes',
            icon: 'dashboard',
            value: formatCurrency(monthly.balance),
            tone: toNumber(monthly.balance) >= 0 ? 'positive' : 'danger',
            trend: trendSummary.value?.balance,
            note: 'Resultado do periodo selecionado',
        },
        {
            id: 'annual-income',
            title: 'Receitas do ano',
            icon: 'annual',
            value: formatCurrency(annual.income_total),
            tone: 'neutral',
            trend: { tone: 'neutral', label: 'Acumulado no ano', icon: 'chart' },
            note: 'Consolidado anual',
        },
        {
            id: 'annual-expense',
            title: 'Despesas do ano',
            icon: 'expenses',
            value: formatCurrency(annual.expense_total),
            tone: 'neutral',
            trend: { tone: 'neutral', label: 'Consolidado anual', icon: 'chart' },
            note: 'Consolidado anual',
        },
        {
            id: 'annual-balance',
            title: 'Saldo anual',
            icon: 'target',
            value: formatCurrency(annual.balance),
            tone: toNumber(annual.balance) >= 0 ? 'positive' : 'danger',
            trend: { tone: 'neutral', label: 'Saldo acumulado do ano', icon: 'chart' },
            note: 'Receitas - Despesas',
        },
        {
            id: 'commitment',
            title: 'Comprometimento',
            icon: 'alert',
            value: `${toNumber(indicators.expense_commitment_percent).toFixed(2)}%`,
            tone:
                toNumber(indicators.expense_commitment_percent) > 100
                    ? 'danger'
                    : toNumber(indicators.expense_commitment_percent) > 70
                      ? 'warning'
                      : 'positive',
            trend: { tone: 'neutral', label: 'Percentual da renda consumida', icon: 'progress' },
            note: 'Despesas x receitas do mes',
        },
        {
            id: 'open-debts',
            title: 'Dividas em aberto',
            icon: 'debts',
            value: formatCurrency(indicators.open_debt_total),
            tone: toNumber(indicators.open_debt_total) > 0 ? 'warning' : 'positive',
            trend: { tone: 'neutral', label: 'Total a pagar', icon: 'progress' },
            note: 'Soma de pendentes e atrasadas',
        },
        {
            id: 'paid-debts',
            title: 'Dividas pagas',
            icon: 'check',
            value: formatCurrency(indicators.paid_debt_total),
            tone: 'positive',
            trend: { tone: 'neutral', label: 'Historico de pagamentos', icon: 'progress' },
            note: 'Valor ja quitado',
        },
    ];
});

const progressCards = computed(() => {
    if (!dashboard.value) return [];

    const indicators = dashboard.value.indicators;
    const monthly = dashboard.value.monthly;
    const annual = dashboard.value.annual;

    const commitment = toNumber(indicators.expense_commitment_percent);
    const paidDebt = toNumber(indicators.paid_debt_total);
    const openDebt = toNumber(indicators.open_debt_total);
    const totalDebt = paidDebt + openDebt;
    const debtProgress = totalDebt > 0 ? (paidDebt / totalDebt) * 100 : 0;

    const emergencyTarget = toNumber(monthly.expense_total) * 6;
    const reserveProgress = emergencyTarget > 0 ? (toNumber(annual.balance) / emergencyTarget) * 100 : 0;

    return [
        {
            id: 'budget-usage',
            title: 'Uso do orcamento mensal',
            icon: 'progress',
            value: `${commitment.toFixed(1).replace('.', ',')}%`,
            percent: clamp(commitment, 0, 100),
            overflow: commitment > 100 ? `${(commitment - 100).toFixed(1).replace('.', ',')}% acima` : '',
            tone: commitment > 100 ? 'danger' : commitment > 70 ? 'warning' : 'positive',
            caption: commitment > 100 ? 'Despesas acima da receita no mes.' : 'Meta recomendada: ate 70%.',
        },
        {
            id: 'debt-progress',
            title: 'Quitacao das dividas',
            icon: 'debts',
            value: `${debtProgress.toFixed(1).replace('.', ',')}%`,
            percent: clamp(debtProgress, 0, 100),
            overflow: '',
            tone: debtProgress >= 65 ? 'positive' : debtProgress >= 35 ? 'warning' : 'danger',
            caption: `${formatCurrency(paidDebt)} pagos de ${formatCurrency(totalDebt)}.`,
        },
        {
            id: 'reserve-target',
            title: 'Meta de reserva (6 meses)',
            icon: 'target',
            value: `${clamp(reserveProgress, 0, 999).toFixed(1).replace('.', ',')}%`,
            percent: clamp(reserveProgress, 0, 100),
            overflow:
                reserveProgress > 100
                    ? `${(reserveProgress - 100).toFixed(1).replace('.', ',')}% acima da meta`
                    : '',
            tone: reserveProgress >= 100 ? 'positive' : reserveProgress >= 50 ? 'warning' : 'danger',
            caption: `Saldo anual ${formatCurrency(annual.balance)} de meta ${formatCurrency(emergencyTarget)}.`,
        },
    ];
});

const alerts = computed(() => {
    if (!dashboard.value) return [];

    const result = [];
    const monthly = dashboard.value.monthly;
    const indicators = dashboard.value.indicators;
    const commitment = toNumber(indicators.expense_commitment_percent);
    const openDebt = toNumber(indicators.open_debt_total);
    const income = toNumber(monthly.income_total);

    if (toNumber(monthly.balance) < 0) {
        result.push({
            id: 'negative-balance',
            tone: 'danger',
            icon: 'alert',
            title: 'Saldo negativo no mes',
            description: 'Revise despesas variaveis e priorize cortes imediatos neste periodo.',
            actionLabel: 'Abrir despesas',
            actionTo: '/despesas',
        });
    }

    if (commitment > 100) {
        result.push({
            id: 'high-commitment',
            tone: 'danger',
            icon: 'trendDown',
            title: 'Comprometimento acima de 100%',
            description: 'Seu custo mensal esta maior do que a receita atual. Ajuste categoria por categoria.',
            actionLabel: 'Revisar dashboard',
            actionTo: '/dashboard',
        });
    } else if (commitment > 70) {
        result.push({
            id: 'attention-commitment',
            tone: 'warning',
            icon: 'alert',
            title: 'Comprometimento alto',
            description: 'Voce esta acima da faixa recomendada de 70%. Vale renegociar despesas fixas.',
            actionLabel: 'Ver despesas',
            actionTo: '/despesas',
        });
    }

    if (openDebt > 0 && income > 0 && openDebt > income * 2) {
        result.push({
            id: 'open-debt-risk',
            tone: 'warning',
            icon: 'debts',
            title: 'Dividas em aberto elevadas',
            description: 'O total aberto passou de 2x da renda mensal. Foque em quitar juros mais altos primeiro.',
            actionLabel: 'Ir para dividas',
            actionTo: '/dividas',
        });
    }

    if (!result.length) {
        result.push({
            id: 'all-good',
            tone: 'positive',
            icon: 'check',
            title: 'Cenario sob controle',
            description: 'Indicadores principais estao em equilibrio. Continue registrando as movimentacoes.',
            actionLabel: 'Lancar receita',
            actionTo: '/receitas',
        });
    }

    return result;
});

const quickActions = [
    { id: 'qa-income', icon: 'plus', label: 'Nova receita', to: '/receitas' },
    { id: 'qa-expense', icon: 'plus', label: 'Nova despesa', to: '/despesas' },
    { id: 'qa-debt', icon: 'plus', label: 'Nova divida', to: '/dividas' },
    { id: 'qa-annual', icon: 'annual', label: 'Ver visao anual', to: '/anual' },
];

const updatedAtLabel = computed(() => {
    if (!updatedAt.value) return '';

    return updatedAt.value.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
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
        updatedAt.value = new Date();

        await nextTick();
        renderCharts();
    } catch {
        error.value = 'Nao foi possivel carregar o dashboard.';
    } finally {
        loading.value = false;
    }
};

const renderCharts = () => {
    if (!dashboard.value) return;
    if (!incomeExpenseCanvas.value || !categoryCanvas.value || !trendLineCanvas.value) return;

    if (incomeExpenseChart) incomeExpenseChart.destroy();
    if (categoryChart) categoryChart.destroy();
    if (trendLineChart) trendLineChart.destroy();

    const monthlyLabels = dashboard.value.charts.income_vs_expense_by_month.labels;
    const monthlyIncomes = incomeSeries.value;
    const monthlyExpenses = expenseSeries.value;

    incomeExpenseChart = new Chart(incomeExpenseCanvas.value, {
        type: 'bar',
        data: {
            labels: monthlyLabels,
            datasets: [
                {
                    label: 'Receitas',
                    data: monthlyIncomes,
                    backgroundColor: '#1f7a8c',
                    borderRadius: 9,
                },
                {
                    label: 'Despesas',
                    data: monthlyExpenses,
                    backgroundColor: '#bf4342',
                    borderRadius: 9,
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
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatCurrency(value),
                    },
                },
            },
        },
    });

    const useRightLegend = window.innerWidth > 1200;

    categoryChart = new Chart(categoryCanvas.value, {
        type: 'doughnut',
        data: {
            labels: hasCategoryData.value ? categoryChartData.value.labels : ['Sem despesas no periodo'],
            datasets: [
                {
                    data: hasCategoryData.value ? categoryChartData.value.values : [1],
                    backgroundColor: [
                        '#1f7a8c',
                        '#bf4342',
                        '#f7b32b',
                        '#3a7d44',
                        '#5f0f40',
                        '#0d3b66',
                        '#f4a261',
                        '#adb5bd',
                    ],
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
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
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (!hasCategoryData.value) return 'Sem valores para o periodo';
                            return `${context.label}: ${formatCurrency(context.parsed || 0)}`;
                        },
                    },
                },
                doughnutPercentage: {
                    enabled: hasCategoryData.value,
                },
            },
        },
    });

    const monthLabels = timeline.value.map((row) => monthName(row.month).slice(0, 3));
    const monthlyBalance = timeline.value.map((row) => toNumber(row.balance));
    const accumulatedBalance = timeline.value.map((row) => toNumber(row.accumulated_balance));

    trendLineChart = new Chart(trendLineCanvas.value, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Saldo mensal',
                    data: monthlyBalance,
                    borderColor: '#bf4342',
                    backgroundColor: 'rgba(191, 67, 66, 0.14)',
                    fill: true,
                    tension: 0.33,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                },
                {
                    label: 'Saldo acumulado',
                    data: accumulatedBalance,
                    borderColor: '#1f7a8c',
                    backgroundColor: 'rgba(31, 122, 140, 0.18)',
                    fill: true,
                    tension: 0.33,
                    pointRadius: 4,
                    pointHoverRadius: 6,
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

onMounted(fetchDashboard);

onBeforeUnmount(() => {
    if (incomeExpenseChart) incomeExpenseChart.destroy();
    if (categoryChart) categoryChart.destroy();
    if (trendLineChart) trendLineChart.destroy();
});
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Dashboard Financeiro</h2>
                <p>Visao mensal e anual com indicadores estrategicos e acoes recomendadas.</p>
                <p v-if="updatedAtLabel" class="hint-text">Atualizado em {{ updatedAtLabel }}</p>
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
                <button class="btn-primary" type="button" @click="fetchDashboard" :disabled="loading">
                    <AppIcon name="refresh" :size="16" />
                    <span>{{ loading ? 'Atualizando...' : 'Atualizar' }}</span>
                </button>
            </div>
        </header>

        <p class="error-text" v-if="error">{{ error }}</p>

        <div v-if="loading && !dashboard" class="panel panel-loading">Carregando indicadores...</div>

        <template v-if="dashboard">
            <section class="alerts-grid">
                <article
                    v-for="alert in alerts"
                    :key="alert.id"
                    class="alert-card"
                    :class="`tone-${alert.tone}`"
                >
                    <div class="alert-head">
                        <span class="alert-icon">
                            <AppIcon :name="alert.icon" :size="17" />
                        </span>
                        <strong>{{ alert.title }}</strong>
                    </div>
                    <p>{{ alert.description }}</p>
                    <RouterLink :to="alert.actionTo" class="btn-link">{{ alert.actionLabel }}</RouterLink>
                </article>
            </section>

            <div class="cards-grid dashboard-cards-grid">
                <article v-for="card in kpiCards" :key="card.id" class="metric-card kpi-card" :class="`tone-${card.tone}`">
                    <div class="metric-head">
                        <span class="metric-icon">
                            <AppIcon :name="card.icon" :size="16" />
                        </span>
                        <h3>{{ card.title }}</h3>
                    </div>
                    <strong>{{ card.value }}</strong>
                    <p class="metric-trend" :class="`tone-${card.trend?.tone || 'neutral'}`">
                        <AppIcon :name="card.trend?.icon || 'progress'" :size="14" />
                        <span>{{ card.trend?.label || card.note }}</span>
                    </p>
                    <small>{{ card.note }}</small>
                </article>
            </div>

            <section class="progress-grid">
                <article v-for="card in progressCards" :key="card.id" class="progress-card" :class="`tone-${card.tone}`">
                    <div class="progress-head">
                        <div class="progress-title">
                            <AppIcon :name="card.icon" :size="15" />
                            <h3>{{ card.title }}</h3>
                        </div>
                        <strong>{{ card.value }}</strong>
                    </div>
                    <div class="progress-track">
                        <span :style="{ width: `${card.percent}%` }" />
                    </div>
                    <p>{{ card.caption }}</p>
                    <small v-if="card.overflow">{{ card.overflow }}</small>
                </article>
            </section>

            <section class="quick-actions">
                <RouterLink v-for="action in quickActions" :key="action.id" :to="action.to" class="quick-action-btn">
                    <AppIcon :name="action.icon" :size="15" />
                    <span>{{ action.label }}</span>
                </RouterLink>
            </section>

            <div class="charts-grid">
                <article class="chart-card">
                    <h3>Receitas x Despesas por Mes</h3>
                    <p class="hint-text" v-if="!hasAnyMovement">Ainda sem movimentacoes no ano selecionado.</p>
                    <div class="chart-holder">
                        <canvas ref="incomeExpenseCanvas" />
                    </div>
                </article>

                <article class="chart-card">
                    <h3>Despesas por Categoria no Mes</h3>
                    <p class="hint-text" v-if="!hasCategoryData">Nenhuma despesa por categoria neste periodo.</p>
                    <div class="chart-holder">
                        <canvas ref="categoryCanvas" />
                    </div>
                </article>
            </div>

            <article class="chart-card chart-card-full">
                <h3>Tendencia de Saldo Mensal e Acumulado</h3>
                <div class="chart-holder chart-holder-line">
                    <canvas ref="trendLineCanvas" />
                </div>
            </article>
        </template>
    </section>
</template>
