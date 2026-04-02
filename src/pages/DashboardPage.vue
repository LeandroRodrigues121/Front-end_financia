<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, monthName } from '@/utils/formatters';
import { expenseCategoryLabel, monthOptions } from '@/utils/labels';

const categoryOuterLabelsPlugin = {
    id: 'categoryOuterLabelsPlugin',
    afterDatasetsDraw(chart, _args, pluginOptions) {
        if (chart.config.type !== 'doughnut') return;
        if (!pluginOptions?.enabled) return;

        const dataset = chart.data?.datasets?.[0];
        const labels = chart.data?.labels || [];
        const meta = chart.getDatasetMeta(0);
        if (!dataset || !meta?.data?.length) return;
        if (chart.width < 420) return;

        const values = (dataset.data || []).map((value) => Number(value || 0));
        const total = values.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return;

        const { ctx } = chart;
        const items = meta.data
            .map((arc, index) => {
                const value = values[index] || 0;
                if (value <= 0) return null;

                const { x, y, startAngle, endAngle, outerRadius } = arc.getProps(
                    ['x', 'y', 'startAngle', 'endAngle', 'outerRadius'],
                    true,
                );

                const angle = (startAngle + endAngle) / 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const isRight = cos >= 0;

                return {
                    index,
                    label: String(labels[index] || ''),
                    color: Array.isArray(dataset.backgroundColor)
                        ? dataset.backgroundColor[index]
                        : dataset.backgroundColor || '#3498DB',
                    startX: x + cos * (outerRadius + 3),
                    startY: y + sin * (outerRadius + 3),
                    elbowX: x + cos * (outerRadius + 18),
                    elbowY: y + sin * (outerRadius + 18),
                    isRight,
                };
            })
            .filter(Boolean);

        const spacing = 14;
        const adjustSide = (sideItems) => {
            sideItems.sort((a, b) => a.elbowY - b.elbowY);
            for (let i = 1; i < sideItems.length; i += 1) {
                if (sideItems[i].elbowY - sideItems[i - 1].elbowY < spacing) {
                    sideItems[i].elbowY = sideItems[i - 1].elbowY + spacing;
                }
            }
        };

        const rightItems = items.filter((item) => item.isRight);
        const leftItems = items.filter((item) => !item.isRight);
        adjustSide(rightItems);
        adjustSide(leftItems);

        ctx.save();
        ctx.font = '600 12px Manrope, sans-serif';
        ctx.fillStyle = '#46584d';
        ctx.lineWidth = 2;

        items.forEach((item) => {
            const lineEndX = item.isRight ? item.elbowX + 16 : item.elbowX - 16;
            const textX = item.isRight ? lineEndX + 5 : lineEndX - 5;
            const textAlign = item.isRight ? 'left' : 'right';

            ctx.strokeStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(item.startX, item.startY);
            ctx.lineTo(item.elbowX, item.elbowY);
            ctx.lineTo(lineEndX, item.elbowY);
            ctx.stroke();

            ctx.textAlign = textAlign;
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, textX, item.elbowY);
        });

        ctx.restore();
    },
};

Chart.register(...registerables, categoryOuterLabelsPlugin);

const toNumber = (value) => Number(value || 0);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const BAR_RANGE_OPTIONS = [3, 6, 12];

const categoryColorMap = {
    moradia: '#3F9DD3',
    alimentacao: '#39B6D7',
    contas_fixas: '#8DCEA9',
    saude: '#F0D35A',
    transporte: '#F39B7A',
    lazer: '#EB6A8C',
    educacao: '#A7D7A8',
    outros: '#A7B3BF',
};

const fallbackCategoryColors = ['#3F9DD3', '#39B6D7', '#8DCEA9', '#F0D35A', '#F39B7A', '#EB6A8C', '#A7D7A8', '#A7B3BF'];

const trendDescriptor = (current, previous, { inverse = false } = {}) => {
    if (previous === null || previous === undefined) {
        return { tone: 'neutral', label: 'Sem base de comparação', icon: 'progress' };
    }

    if (previous === 0 && current === 0) {
        return { tone: 'neutral', label: 'Sem variação', icon: 'progress' };
    }

    const change = ((current - previous) / (Math.abs(previous) || 1)) * 100;
    if (Math.abs(change) < 0.01) {
        return { tone: 'neutral', label: 'Sem variação', icon: 'progress' };
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

const variationLabel = (current, previous) => {
    if (previous === null || previous === undefined) return 'sem base comparativa';
    if (previous === 0 && current === 0) return 'sem variação';
    if (previous === 0) return 'novo valor neste mês';

    const change = ((current - previous) / Math.abs(previous)) * 100;
    const signal = change > 0 ? '+' : '';

    return `${signal}${change.toFixed(1).replace('.', ',')}% vs mês anterior`;
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
const barRangeMonths = ref(6);

const incomeExpenseCanvas = ref(null);
const categoryCanvas = ref(null);
const monthlyTrendCanvas = ref(null);
const accumulatedTrendCanvas = ref(null);

let incomeExpenseChart = null;
let categoryChart = null;
let monthlyTrendChart = null;
let accumulatedTrendChart = null;

const selectedPeriodMonth = computed(() => toNumber(dashboard.value?.period?.month || filters.month || currentDate.getMonth() + 1));
const selectedMonthIndex = computed(() => Math.max(selectedPeriodMonth.value - 1, 0));
const previousMonthIndex = computed(() => (selectedMonthIndex.value > 0 ? selectedMonthIndex.value - 1 : null));
const previousMonthLabel = computed(() => {
    if (previousMonthIndex.value === null) return 'mês anterior';
    return monthName(previousMonthIndex.value + 1);
});

const incomeSeries = computed(
    () => dashboard.value?.charts?.income_vs_expense_by_month?.incomes?.map((value) => toNumber(value)) || [],
);

const expenseSeries = computed(
    () => dashboard.value?.charts?.income_vs_expense_by_month?.expenses?.map((value) => toNumber(value)) || [],
);

const monthlyLabels = computed(() => dashboard.value?.charts?.income_vs_expense_by_month?.labels || []);

const monthlyRows = computed(() =>
    monthlyLabels.value.map((label, index) => ({
        index,
        label,
        income: incomeSeries.value[index] || 0,
        expense: expenseSeries.value[index] || 0,
    })),
);

const rowsUpToSelectedMonth = computed(() => monthlyRows.value.filter((row) => row.index <= selectedMonthIndex.value));

const barPeriodRows = computed(() => {
    if (!rowsUpToSelectedMonth.value.length) return [];

    const requested = Math.max(1, Math.min(barRangeMonths.value, rowsUpToSelectedMonth.value.length));
    return rowsUpToSelectedMonth.value.slice(-requested);
});

const hasAnyMovement = computed(() => rowsUpToSelectedMonth.value.some((row) => row.income > 0 || row.expense > 0));

const lastThreeIncomeRows = computed(() => rowsUpToSelectedMonth.value.slice(-3));

const fallbackRecommendedExpenseLimit = computed(() => {
    if (!lastThreeIncomeRows.value.length) return 0;

    const averageIncome =
        lastThreeIncomeRows.value.reduce((total, row) => total + toNumber(row.income), 0) /
        lastThreeIncomeRows.value.length;

    return averageIncome * 0.7;
});

const recommendedExpenseLimit = computed(() => {
    const fromApi = toNumber(dashboard.value?.indicators?.recommended_expense_limit);
    return fromApi > 0 ? fromApi : fallbackRecommendedExpenseLimit.value;
});

const categoryBreakdown = computed(() => {
    const keys = dashboard.value?.charts?.expenses_by_category?.labels || [];
    const values = dashboard.value?.charts?.expenses_by_category?.values?.map((value) => toNumber(value)) || [];
    const total = values.reduce((sum, value) => sum + value, 0);

    return keys
        .map((key, index) => {
            const value = values[index] || 0;
            return {
                key,
                label: expenseCategoryLabel(key),
                value,
                percent: total > 0 ? (value / total) * 100 : 0,
                color: categoryColorMap[key] || fallbackCategoryColors[index % fallbackCategoryColors.length],
            };
        })
        .filter((item) => item.value > 0);
});

const hasCategoryData = computed(() => categoryBreakdown.value.some((item) => item.value > 0));
const maxCategoryValue = computed(() =>
    categoryBreakdown.value.reduce((max, item) => (item.value > max ? item.value : max), 0),
);

const categoryBarWidth = (value) => {
    const maxValue = maxCategoryValue.value || 1;
    const width = (toNumber(value) / maxValue) * 100;
    return `${Math.max(width, 8)}%`;
};

const formatPercentLabel = (percent) => `${toNumber(percent).toFixed(1).replace('.', ',')}%`;

const timelineRows = computed(() => {
    const fullTimeline = dashboard.value?.monthly_balance_timeline || [];
    const rows = fullTimeline.filter((row) => toNumber(row.month) <= selectedPeriodMonth.value);

    return rows.length ? rows : fullTimeline;
});

const lowestBalancePoint = computed(() => {
    if (!timelineRows.value.length) return null;

    return timelineRows.value.reduce((lowest, currentRow) =>
        toNumber(currentRow.balance) < toNumber(lowest.balance) ? currentRow : lowest,
    );
});

const lowestBalanceIndex = computed(() => {
    if (!lowestBalancePoint.value) return -1;

    return timelineRows.value.findIndex(
        (row) =>
            toNumber(row.month) === toNumber(lowestBalancePoint.value.month) &&
            toNumber(row.balance) === toNumber(lowestBalancePoint.value.balance),
    );
});

const trendSummary = computed(() => {
    if (!dashboard.value) return null;

    const currentIncome = incomeSeries.value[selectedMonthIndex.value] || 0;
    const currentExpense = expenseSeries.value[selectedMonthIndex.value] || 0;
    const currentBalance = currentIncome - currentExpense;

    const previousIncome = previousMonthIndex.value === null ? null : incomeSeries.value[previousMonthIndex.value] || 0;
    const previousExpense = previousMonthIndex.value === null ? null : expenseSeries.value[previousMonthIndex.value] || 0;
    const previousBalance =
        previousIncome === null || previousExpense === null
            ? null
            : toNumber(previousIncome) - toNumber(previousExpense);

    return {
        income: trendDescriptor(currentIncome, previousIncome),
        expense: trendDescriptor(currentExpense, previousExpense, { inverse: true }),
        balance: trendDescriptor(currentBalance, previousBalance),
        previousBalance,
    };
});

const kpiCards = computed(() => {
    if (!dashboard.value) return [];

    const monthly = dashboard.value.monthly;
    const annual = dashboard.value.annual;
    const indicators = dashboard.value.indicators;

    const commitment = toNumber(indicators.expense_commitment_percent);
    const commitmentTone = commitment > 100 ? 'danger' : commitment > 70 ? 'warning' : 'positive';

    const emergencyTarget = toNumber(monthly.expense_total) * 6;
    const reserveProgress = emergencyTarget > 0 ? (toNumber(annual.balance) / emergencyTarget) * 100 : 0;
    const reserveTone = reserveProgress >= 100 ? 'positive' : reserveProgress >= 50 ? 'warning' : 'danger';

    const openDebt = toNumber(indicators.open_debt_total);

    const monthlyBalanceTrend =
        trendSummary.value?.previousBalance === null
            ? 'Sem base de comparação no primeiro mês carregado.'
            : `${trendSummary.value?.balance?.label || 'Sem variação'} vs ${previousMonthLabel.value}`;

    return [
        {
            id: 'monthly-balance',
            title: 'Saldo atual (mês)',
            icon: 'dashboard',
            value: formatCurrency(monthly.balance),
            tone: toNumber(monthly.balance) >= 0 ? 'positive' : 'danger',
            description: 'Indicador principal para decisões imediatas.',
            highlight: monthlyBalanceTrend,
            highlightIcon: trendSummary.value?.balance?.icon || 'progress',
            highlightTone: trendSummary.value?.balance?.tone || 'neutral',
        },
        {
            id: 'commitment',
            title: 'Comprometimento da renda',
            icon: 'alert',
            value: `${commitment.toFixed(2).replace('.', ',')}%`,
            tone: commitmentTone,
            description: commitment > 100 ? 'Acima de 100%: custo mensal excedeu a renda.' : 'Meta recomendada: até 70%.',
            meter: clamp(commitment, 0, 100),
            overflow: commitment > 100 ? `${(commitment - 100).toFixed(1).replace('.', ',')}% acima do limite.` : '',
        },
        {
            id: 'reserve-target',
            title: 'Meta de reserva (6 meses)',
            icon: 'target',
            value: `${reserveProgress.toFixed(1).replace('.', ',')}%`,
            tone: reserveTone,
            description: `${formatCurrency(annual.balance)} acumulados de ${formatCurrency(emergencyTarget)}.`,
            meter: clamp(reserveProgress, 0, 100),
            overflow:
                reserveProgress > 100
                    ? `${(reserveProgress - 100).toFixed(1).replace('.', ',')}% acima da meta.`
                    : reserveProgress < 0
                      ? 'Saldo anual negativo: reserva ainda não iniciada.'
                      : '',
        },
        {
            id: 'open-debts',
            title: 'Dívidas em aberto',
            icon: 'debts',
            value: formatCurrency(openDebt),
            tone: openDebt > 0 ? 'warning' : 'positive',
            description: openDebt > 0 ? 'Priorize as dívidas com maior juros primeiro.' : 'Nenhuma dívida pendente no momento.',
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
            title: 'Saldo negativo no mês',
            description: `Seu saldo está em ${formatCurrency(monthly.balance)}. Foque no corte de gastos variáveis agora.`,
            actions: [
                { id: 'negative-balance-expenses', label: 'Ver despesas variáveis', to: '/despesas' },
                { id: 'negative-balance-income', label: 'Lançar receita extra', to: '/receitas' },
            ],
        });
    }

    if (commitment > 100) {
        result.push({
            id: 'high-commitment',
            tone: 'danger',
            icon: 'trendDown',
            title: 'Comprometimento acima de 100%',
            description: `Você consumiu ${commitment.toFixed(2).replace('.', ',')}% da renda no período selecionado.`,
            actions: [
                { id: 'high-commitment-budget', label: 'Ajustar orçamento', to: '/despesas' },
                { id: 'high-commitment-categories', label: 'Ver categorias críticas', to: '/anual' },
            ],
        });
    } else if (commitment > 70) {
        result.push({
            id: 'attention-commitment',
            tone: 'warning',
            icon: 'alert',
            title: 'Comprometimento elevado',
            description: `Você está em ${commitment.toFixed(2).replace('.', ',')}%. A faixa recomendada é até 70%.`,
            actions: [
                { id: 'attention-commitment-expenses', label: 'Revisar despesas fixas', to: '/despesas' },
                { id: 'attention-commitment-report', label: 'Comparar nos relatórios', to: '/anual' },
            ],
        });
    }

    if (openDebt > 0 && income > 0 && openDebt > income * 2) {
        result.push({
            id: 'open-debt-risk',
            tone: 'warning',
            icon: 'debts',
            title: 'Dívidas em aberto elevadas',
            description: `As dívidas abertas chegaram a ${formatCurrency(openDebt)} e já superam 2x sua renda mensal.`,
            actions: [
                { id: 'open-debt-risk-debts', label: 'Priorizar quitações', to: '/dividas' },
                { id: 'open-debt-risk-expenses', label: 'Cortar gastos não essenciais', to: '/despesas' },
            ],
        });
    }

    if (!result.length) {
        result.push({
            id: 'all-good',
            tone: 'positive',
            icon: 'check',
            title: 'Cenário sob controle',
            description: 'Indicadores principais estão dentro da faixa esperada neste período.',
            actions: [
                { id: 'all-good-income', label: 'Registrar nova receita', to: '/receitas' },
                { id: 'all-good-report', label: 'Abrir relatórios', to: '/anual' },
            ],
        });
    }

    return result;
});

const quickActions = [
    { id: 'qa-income', icon: 'plus', label: 'Nova receita', to: '/receitas' },
    { id: 'qa-expense', icon: 'plus', label: 'Nova despesa', to: '/despesas' },
    { id: 'qa-debt', icon: 'plus', label: 'Nova dívida', to: '/dividas' },
    { id: 'qa-report', icon: 'annual', label: 'Relatórios', to: '/anual' },
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

const barRangeLabel = computed(() => {
    const months = barPeriodRows.value.length;
    if (!months) return 'Sem meses disponíveis para o filtro atual.';

    if (months === 1) {
        return 'Último mês disponível no período selecionado.';
    }

    return `Últimos ${months} meses até ${monthName(selectedPeriodMonth.value)}.`;
});

const recommendedLimitDescription = computed(
    () =>
        `Limite recomendado de despesas: ${formatCurrency(recommendedExpenseLimit.value)} (70% da sua receita média dos últimos 3 meses, para manter equilíbrio financeiro). Recalculado a cada mês.`,
);

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
        filters.month = data?.period?.month || filters.month;
        filters.year = data?.period?.year || filters.year;
        updatedAt.value = new Date();

        await nextTick();
        renderCharts();
    } catch {
        error.value = 'Não foi possível carregar o dashboard.';
    } finally {
        loading.value = false;
    }
};

const destroyCharts = () => {
    if (incomeExpenseChart) {
        incomeExpenseChart.destroy();
        incomeExpenseChart = null;
    }

    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    if (monthlyTrendChart) {
        monthlyTrendChart.destroy();
        monthlyTrendChart = null;
    }

    if (accumulatedTrendChart) {
        accumulatedTrendChart.destroy();
        accumulatedTrendChart = null;
    }
};

const renderCharts = () => {
    if (!dashboard.value) return;
    if (!incomeExpenseCanvas.value || !categoryCanvas.value || !monthlyTrendCanvas.value || !accumulatedTrendCanvas.value) {
        return;
    }

    destroyCharts();

    const chartRows = barPeriodRows.value;
    const chartLabels = chartRows.map((row) => row.label);
    const chartIncomes = chartRows.map((row) => row.income);
    const chartExpenses = chartRows.map((row) => row.expense);
    const recommendedLimitValue = recommendedExpenseLimit.value;
    const recommendedLimitLabel = `Limite recomendado: ${formatCurrency(recommendedLimitValue)}`;
    const chartExpenseLimit = chartRows.map(() => recommendedLimitValue);

    incomeExpenseChart = new Chart(incomeExpenseCanvas.value, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Receitas',
                    data: chartIncomes,
                    backgroundColor: '#1F7A8C',
                    borderRadius: 8,
                    order: 2,
                },
                {
                    type: 'bar',
                    label: 'Despesas',
                    data: chartExpenses,
                    backgroundColor: '#BF4342',
                    borderRadius: 8,
                    order: 2,
                },
                {
                    type: 'line',
                    label: recommendedLimitLabel,
                    data: chartExpenseLimit,
                    borderColor: '#F39C12',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    order: 1,
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
                    labels: {
                        color: '#425548',
                        usePointStyle: true,
                        pointStyle: 'circle',
                    },
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const datasetLabel = context.dataset.label;
                            const value = toNumber(context.parsed.y);

                            if (datasetLabel === recommendedLimitLabel) {
                                return `${recommendedLimitLabel} (70% da receita média dos últimos 3 meses)`;
                            }

                            const row = chartRows[context.dataIndex];
                            const prevIndex = (row?.index ?? 0) - 1;
                            const previousValue =
                                prevIndex >= 0
                                    ? datasetLabel === 'Receitas'
                                        ? incomeSeries.value[prevIndex] || 0
                                        : expenseSeries.value[prevIndex] || 0
                                    : null;

                            return `${datasetLabel}: ${formatCurrency(value)} (${variationLabel(value, previousValue)})`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: Math.max(...chartIncomes, ...chartExpenses, recommendedLimitValue, 0) * 1.2,
                    ticks: {
                        callback: (value) => formatCurrency(value),
                    },
                },
            },
        },
    });

    const categoryEntries = categoryBreakdown.value;

    categoryChart = new Chart(categoryCanvas.value, {
        type: 'doughnut',
        data: {
            labels: hasCategoryData.value ? categoryEntries.map((item) => item.label) : ['Sem despesas no período'],
            datasets: [
                {
                    data: hasCategoryData.value ? categoryEntries.map((item) => item.value) : [1],
                    backgroundColor: hasCategoryData.value ? categoryEntries.map((item) => item.color) : ['#D6EAF8'],
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '56%',
            layout: {
                padding: {
                    top: 24,
                    right: 56,
                    bottom: 24,
                    left: 56,
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
                categoryOuterLabelsPlugin: {
                    enabled: hasCategoryData.value,
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (!hasCategoryData.value) return 'Sem valores para o período';

                            const item = categoryEntries[context.dataIndex];
                            return `${context.label}: ${formatCurrency(context.parsed || 0)} (${formatPercentLabel(item?.percent)})`;
                        },
                    },
                },
            },
        },
    });

    const trendLabels = timelineRows.value.map((row) => monthName(row.month).slice(0, 3));
    const monthlyBalance = timelineRows.value.map((row) => toNumber(row.balance));
    const accumulatedBalance = timelineRows.value.map((row) => toNumber(row.accumulated_balance));

    monthlyTrendChart = new Chart(monthlyTrendCanvas.value, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [
                {
                    label: 'Saldo mensal',
                    data: monthlyBalance,
                    borderColor: '#E74C3C',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius(context) {
                        return context.dataIndex === lowestBalanceIndex.value ? 6 : 3;
                    },
                    pointBackgroundColor(context) {
                        return context.dataIndex === lowestBalanceIndex.value ? '#B03A2E' : '#E74C3C';
                    },
                    pointHoverRadius: 6,
                    fill: false,
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
                    labels: {
                        color: '#425548',
                        usePointStyle: true,
                        pointStyle: 'line',
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
                y: {
                    ticks: {
                        callback: (value) => formatCurrency(value),
                    },
                    title: {
                        display: true,
                        text: 'Saldo mensal',
                        color: '#5F6E63',
                    },
                },
            },
        },
    });

    accumulatedTrendChart = new Chart(accumulatedTrendCanvas.value, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [
                {
                    label: 'Saldo acumulado',
                    data: accumulatedBalance,
                    borderColor: '#3498DB',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: false,
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
                    labels: {
                        color: '#425548',
                        usePointStyle: true,
                        pointStyle: 'line',
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
                y: {
                    ticks: {
                        callback: (value) => formatCurrency(value),
                    },
                    title: {
                        display: true,
                        text: 'Saldo acumulado',
                        color: '#5F6E63',
                    },
                },
            },
        },
    });
};

watch(barRangeMonths, () => {
    if (!dashboard.value) return;
    renderCharts();
});

onMounted(fetchDashboard);

onBeforeUnmount(() => {
    destroyCharts();
});
</script>

<template>
    <section class="page dashboard-page">
        <header class="page-header dashboard-header">
            <div>
                <h2>Dashboard Financeiro</h2>
                <p>Alertas, resumo essencial do mês e análise visual para decisão rápida.</p>
                <p v-if="updatedAtLabel" class="hint-text">Atualizado em {{ updatedAtLabel }}</p>
            </div>

            <div class="dashboard-header-controls">
                <div class="filters">
                    <label>
                        Mês
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

                <section class="quick-actions quick-actions-header">
                    <RouterLink v-for="action in quickActions" :key="action.id" :to="action.to" class="quick-action-btn quick-action-btn-header">
                        <AppIcon :name="action.icon" :size="15" />
                        <span>{{ action.label }}</span>
                    </RouterLink>
                </section>
            </div>
        </header>

        <p class="error-text" v-if="error">{{ error }}</p>

        <div v-if="loading && !dashboard" class="panel panel-loading">Carregando indicadores...</div>

        <template v-if="dashboard">
            <section class="alerts-grid">
                <article v-for="alert in alerts" :key="alert.id" class="alert-card" :class="`tone-${alert.tone}`">
                    <div class="alert-head">
                        <span class="alert-icon">
                            <AppIcon :name="alert.icon" :size="17" />
                        </span>
                        <strong>{{ alert.title }}</strong>
                    </div>
                    <p>{{ alert.description }}</p>

                    <div class="alert-actions">
                        <RouterLink v-for="action in alert.actions" :key="action.id" :to="action.to" class="alert-action">
                            {{ action.label }}
                        </RouterLink>
                    </div>
                </article>
            </section>

            <div class="cards-grid dashboard-cards-grid dashboard-kpi-grid">
                <article v-for="card in kpiCards" :key="card.id" class="metric-card kpi-card" :class="`tone-${card.tone}`">
                    <div class="metric-head">
                        <span class="metric-icon">
                            <AppIcon :name="card.icon" :size="16" />
                        </span>
                        <h3>{{ card.title }}</h3>
                    </div>

                    <strong>{{ card.value }}</strong>
                    <p class="metric-description">{{ card.description }}</p>

                    <p v-if="card.highlight" class="metric-trend" :class="`tone-${card.highlightTone || card.tone || 'neutral'}`">
                        <AppIcon :name="card.highlightIcon || 'progress'" :size="14" />
                        <span>{{ card.highlight }}</span>
                    </p>

                    <div v-if="card.meter !== undefined" class="progress-track progress-track-compact">
                        <span class="metric-progress-fill" :style="{ width: `${card.meter}%` }" />
                    </div>

                    <small v-if="card.overflow">{{ card.overflow }}</small>
                </article>
            </div>

            <div class="charts-grid">
                <article class="chart-card">
                    <div class="chart-title-row">
                        <h3>Receitas x Despesas</h3>
                        <div class="range-switch">
                            <button
                                v-for="range in BAR_RANGE_OPTIONS"
                                :key="`range-${range}`"
                                type="button"
                                class="range-btn"
                                :class="{ active: barRangeMonths === range }"
                                @click="barRangeMonths = range"
                            >
                                {{ range }}m
                            </button>
                        </div>
                    </div>
                    <p class="hint-text" v-if="!hasAnyMovement">Ainda sem movimentações no ano selecionado.</p>
                    <p class="hint-text" v-else>{{ barRangeLabel }}</p>
                    <p class="hint-text hint-finance-education" v-if="hasAnyMovement">{{ recommendedLimitDescription }}</p>
                    <div class="chart-holder">
                        <canvas ref="incomeExpenseCanvas" />
                    </div>
                </article>

                <article class="chart-card">
                    <h3>Despesas por categoria</h3>
                    <p class="hint-text" v-if="!hasCategoryData">Nenhuma despesa por categoria neste período.</p>
                    <div class="expense-categories-layout">
                        <div class="expense-categories-chart-wrap">
                            <div class="chart-holder chart-holder-donut">
                                <canvas ref="categoryCanvas" />
                            </div>
                        </div>

                        <ul v-if="hasCategoryData" class="expense-categories-panel">
                            <li v-for="item in categoryBreakdown" :key="`category-${item.key}`" class="expense-category-row">
                                <div class="expense-category-head">
                                    <div class="category-label-wrap">
                                        <span class="category-dot" :style="{ backgroundColor: item.color }" />
                                        <span>{{ item.label }}</span>
                                    </div>
                                    <strong>{{ formatPercentLabel(item.percent) }}</strong>
                                </div>

                                <div class="expense-category-foot">
                                    <span>{{ formatCurrency(item.value) }}</span>
                                    <div class="expense-category-bar">
                                        <span
                                            class="expense-category-bar-fill"
                                            :style="{ width: categoryBarWidth(item.value), backgroundColor: item.color }"
                                        />
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </article>
            </div>

            <section class="trend-grid">
                <article class="chart-card">
                    <h3>Tendência de saldo mensal</h3>
                    <p class="hint-text" v-if="lowestBalancePoint">
                        Maior queda: {{ monthName(lowestBalancePoint.month) }} ({{ formatCurrency(lowestBalancePoint.balance) }}).
                    </p>
                    <div class="chart-holder chart-holder-trend">
                        <canvas ref="monthlyTrendCanvas" />
                    </div>
                </article>

                <article class="chart-card">
                    <h3>Tendência de saldo acumulado</h3>
                    <p class="hint-text">Evolução acumulada do ano selecionado.</p>
                    <div class="chart-holder chart-holder-trend">
                        <canvas ref="accumulatedTrendCanvas" />
                    </div>
                </article>
            </section>
        </template>
    </section>
</template>
