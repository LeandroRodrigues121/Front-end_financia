<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import AppTooltip from '@/components/AppTooltip.vue';
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
const TREND_VIEW_OPTIONS = [
    { id: 'monthly', label: 'Saldo Mensal' },
    { id: 'accumulated', label: 'Acumulado' },
];

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
const activeTrendView = ref('monthly');
const newEntryMenuOpen = ref(false);

const incomeExpenseCanvas = ref(null);
const categoryCanvas = ref(null);
const trendCanvas = ref(null);
const newEntryMenuRef = ref(null);

let incomeExpenseChart = null;
let categoryChart = null;
let trendChart = null;

const selectedPeriodMonth = computed(() => toNumber(dashboard.value?.period?.month || filters.month || currentDate.getMonth() + 1));
const selectedMonthIndex = computed(() => Math.max(selectedPeriodMonth.value - 1, 0));
const previousMonthIndex = computed(() => (selectedMonthIndex.value > 0 ? selectedMonthIndex.value - 1 : null));
const previousMonthLabel = computed(() => {
    if (previousMonthIndex.value === null) return 'mês anterior';
    return monthName(previousMonthIndex.value + 1);
});

const yearOptions = computed(() => {
    const years = [currentDate.getFullYear() - 3, currentDate.getFullYear() + 3, filters.year, dashboard.value?.period?.year]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 2000);

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    return Array.from({ length: maxYear - minYear + 1 }, (_item, index) => minYear + index);
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
const formatCompactNumber = (value) =>
    toNumber(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

const timelineRows = computed(() => {
    const fullTimeline = dashboard.value?.monthly_balance_timeline || [];
    const rows = fullTimeline.filter((row) => toNumber(row.month) <= selectedPeriodMonth.value);

    return rows.length ? rows : fullTimeline;
});

const trendLabels = computed(() => timelineRows.value.map((row) => monthName(row.month).slice(0, 3)));
const monthlyBalanceSeries = computed(() => timelineRows.value.map((row) => toNumber(row.balance)));
const accumulatedBalanceSeries = computed(() => timelineRows.value.map((row) => toNumber(row.accumulated_balance)));

const activeTrendMeta = computed(() => {
    const isMonthly = activeTrendView.value === 'monthly';
    const values = isMonthly ? monthlyBalanceSeries.value : accumulatedBalanceSeries.value;

    return {
        label: isMonthly ? 'Saldo mensal' : 'Saldo acumulado',
        values,
        lineColor: isMonthly ? '#f43f5e' : '#4f46e5',
        fillColor: isMonthly ? 'rgba(244, 63, 94, 0.12)' : 'rgba(79, 70, 229, 0.12)',
        fillTarget: isMonthly ? 'origin' : 'start',
    };
});

const trendStepSize = computed(() => (activeTrendView.value === 'monthly' ? 1000 : 500));

const trendScaleBounds = computed(() => {
    const values = activeTrendMeta.value.values.filter((value) => Number.isFinite(value));
    if (!values.length) {
        return { min: -1000, max: 1000 };
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const step = trendStepSize.value;

    if (activeTrendView.value === 'monthly') {
        const min = Math.min(0, Math.floor(minValue / step) * step);
        const max = Math.max(0, Math.ceil(maxValue / step) * step);

        return {
            min: min === max ? min - step : min,
            max: min === max ? max + step : max,
        };
    }
    const min = Math.max(0, Math.floor(minValue / step) * step);
    const max = Math.ceil(maxValue / step) * step;

    return {
        min: min === max ? Math.max(0, min - step) : min,
        max: min === max ? max + step : max,
    };
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
            tooltip: 'Indicador principal para decisões imediatas.',
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
            tooltip: 'Percentual da renda consumido pelas despesas no período selecionado.',
            meter: clamp(commitment, 0, 100),
            overflow: commitment > 100 ? `${(commitment - 100).toFixed(1).replace('.', ',')}% acima do limite.` : '',
        },
        {
            id: 'reserve-target',
            title: 'Meta de reserva (6 meses)',
            icon: 'target',
            value: `${reserveProgress.toFixed(1).replace('.', ',')}%`,
            tone: reserveTone,
            tooltip: 'Compara o saldo anual com a meta equivalente a 6 meses de despesas.',
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
            tooltip: openDebt > 0 ? 'Priorize as dívidas com maior juros primeiro.' : 'Total de dívidas pendentes no momento.',
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
            title: `Comprometimento elevado (${commitment.toFixed(2).replace('.', ',')}%)`,
            description: 'Você ultrapassou o limite recomendado de 70% para este mês.',
            actions: [
                { id: 'attention-commitment-expenses', label: 'Revisar gastos', to: '/despesas' },
                { id: 'attention-commitment-report', label: 'Comparar relatórios', to: '/anual' },
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

const newEntryActions = [
    { id: 'income', label: 'Receita', to: '/receitas', icon: 'trendUp', className: 'is-income' },
    { id: 'expense', label: 'Despesa', to: '/despesas', icon: 'trendDown', className: 'is-expense' },
    { id: 'debt', label: 'Dívida', to: '/dividas', icon: 'debts', className: 'is-debt' },
];

const primaryAlert = computed(() => {
    const currentAlert = alerts.value[0];
    if (!currentAlert) return null;

    return {
        ...currentAlert,
        secondaryAction: currentAlert.actions?.length > 1 ? currentAlert.actions[0] : null,
        primaryAction: currentAlert.actions?.length > 1 ? currentAlert.actions[1] : currentAlert.actions?.[0] || null,
    };
});

const dashboardStatusLabel = computed(() => {
    if (!updatedAt.value) return 'Análise essencial do mês.';

    const timeLabel = updatedAt.value.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    const isToday = updatedAt.value.toDateString() === new Date().toDateString();
    const prefix = isToday
        ? `Atualizado hoje, ${timeLabel}`
        : `Atualizado em ${updatedAt.value.toLocaleDateString('pt-BR')}, ${timeLabel}`;

    return `${prefix} • Análise essencial do mês.`;
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

const closeNewEntryMenu = () => {
    newEntryMenuOpen.value = false;
};

const toggleNewEntryMenu = () => {
    newEntryMenuOpen.value = !newEntryMenuOpen.value;
};

const handlePeriodChange = () => {
    if (loading.value) return;
    fetchDashboard();
};

const handleDocumentClick = (event) => {
    if (!newEntryMenuOpen.value) return;

    const target = event.target;
    if (newEntryMenuRef.value?.contains(target)) return;

    closeNewEntryMenu();
};

const handleWindowKeydown = (event) => {
    if (event.key === 'Escape' && newEntryMenuOpen.value) {
        closeNewEntryMenu();
    }
};

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

    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
};

const renderCharts = () => {
    if (!dashboard.value) return;
    if (!incomeExpenseCanvas.value || !categoryCanvas.value || !trendCanvas.value) {
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

    trendChart = new Chart(trendCanvas.value, {
        type: 'line',
        data: {
            labels: trendLabels.value,
            datasets: [
                {
                    label: activeTrendMeta.value.label,
                    data: activeTrendMeta.value.values,
                    borderColor: activeTrendMeta.value.lineColor,
                    backgroundColor: activeTrendMeta.value.fillColor,
                    borderWidth: 4,
                    clip: false,
                    tension: 0.22,
                    cubicInterpolationMode: 'monotone',
                    pointRadius: 6,
                    pointHoverRadius: 6,
                    pointHitRadius: 16,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: activeTrendMeta.value.lineColor,
                    pointBorderWidth: 3,
                    pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: activeTrendMeta.value.lineColor,
                    fill: activeTrendMeta.value.fillTarget,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 20,
                    right: 20,
                    bottom: 10,
                    left: 10,
                },
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false,
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
                    offset: false,
                    grid: {
                        color: 'rgba(148, 163, 184, 0.22)',
                        drawTicks: false,
                    },
                    ticks: {
                        color: '#707c8d',
                        font: {
                            size: 13,
                            weight: '600',
                        },
                    },
                },
                y: {
                    min: trendScaleBounds.value.min,
                    max: trendScaleBounds.value.max,
                    grace: '12%',
                    grid: {
                        color: 'rgba(148, 163, 184, 0.18)',
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: '#707c8d',
                        font: {
                            size: 12,
                            weight: '600',
                        },
                        stepSize: trendStepSize.value,
                        callback: (value) => formatCompactNumber(value),
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

watch(activeTrendView, () => {
    if (!dashboard.value) return;
    renderCharts();
});

onMounted(() => {
    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('keydown', handleWindowKeydown);
    fetchDashboard();
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick);
    window.removeEventListener('keydown', handleWindowKeydown);
    destroyCharts();
});
</script>

<template>
    <section class="page dashboard-page">
        <header class="page-header dashboard-header">
            <div class="dashboard-header-copy">
                <h2>Dashboard Financeiro</h2>
                <p class="dashboard-header-status">
                    <AppIcon name="clock" :size="15" />
                    <span>{{ dashboardStatusLabel }}</span>
                </p>
            </div>

            <div class="dashboard-header-controls">
                <div class="dashboard-toolbar">
                    <div class="dashboard-period-filter">
                        <div class="dashboard-filter-select">
                            <select v-model.number="filters.month" aria-label="Selecionar mês" :disabled="loading" @change="handlePeriodChange">
                                <option v-for="month in monthOptions" :key="month.value" :value="month.value">
                                    {{ month.label }}
                                </option>
                            </select>
                            <AppIcon name="chevronDown" :size="16" />
                        </div>

                        <span class="dashboard-filter-divider" aria-hidden="true"></span>

                        <div class="dashboard-filter-select dashboard-filter-select-year">
                            <select v-model.number="filters.year" aria-label="Selecionar ano" :disabled="loading" @change="handlePeriodChange">
                                <option v-for="year in yearOptions" :key="year" :value="year">
                                    {{ year }}
                                </option>
                            </select>
                            <AppIcon name="chevronDown" :size="16" />
                        </div>
                    </div>

                    <div ref="newEntryMenuRef" class="dashboard-entry-menu">
                        <button
                            class="dashboard-entry-button"
                            type="button"
                            aria-haspopup="menu"
                            :aria-expanded="newEntryMenuOpen"
                            @click.stop="toggleNewEntryMenu"
                        >
                            <AppIcon name="plus" :size="18" />
                            <span>Novo Lançamento</span>
                        </button>

                        <div v-if="newEntryMenuOpen" class="dashboard-entry-panel" role="menu" aria-label="Tipos de lançamento">
                            <RouterLink
                                v-for="action in newEntryActions"
                                :key="action.id"
                                :to="action.to"
                                class="dashboard-entry-item"
                                :class="action.className"
                                role="menuitem"
                                @click="closeNewEntryMenu"
                            >
                                <AppIcon :name="action.icon" :size="18" />
                                <span>{{ action.label }}</span>
                            </RouterLink>
                        </div>
                    </div>

                    <RouterLink to="/anual" class="dashboard-report-shortcut" aria-label="Abrir relatórios anuais">
                        <AppIcon name="annual" :size="19" />
                    </RouterLink>
                </div>
            </div>
        </header>

        <p class="error-text" v-if="error">{{ error }}</p>

        <div v-if="loading && !dashboard" class="panel panel-loading">Carregando indicadores...</div>

        <template v-if="dashboard">
            <section v-if="primaryAlert" class="dashboard-spotlight-alert" :class="`tone-${primaryAlert.tone}`">
                <div class="dashboard-spotlight-alert-main">
                    <span class="dashboard-spotlight-alert-icon">
                        <AppIcon :name="primaryAlert.icon" :size="22" />
                    </span>

                    <div class="dashboard-spotlight-alert-copy">
                        <strong>{{ primaryAlert.title }}</strong>
                        <p>{{ primaryAlert.description }}</p>
                    </div>
                </div>

                <div class="dashboard-spotlight-alert-actions">
                    <RouterLink
                        v-if="primaryAlert.secondaryAction"
                        :to="primaryAlert.secondaryAction.to"
                        class="dashboard-spotlight-alert-link"
                    >
                        {{ primaryAlert.secondaryAction.label }}
                    </RouterLink>

                    <RouterLink
                        v-if="primaryAlert.primaryAction"
                        :to="primaryAlert.primaryAction.to"
                        class="dashboard-spotlight-alert-button"
                    >
                        {{ primaryAlert.primaryAction.label }}
                    </RouterLink>
                </div>
            </section>

            <div class="cards-grid dashboard-cards-grid dashboard-kpi-grid">
                <article v-for="card in kpiCards" :key="card.id" class="metric-card kpi-card" :class="`tone-${card.tone}`">
                    <div class="metric-head">
                        <span class="metric-icon">
                            <AppIcon :name="card.icon" :size="16" />
                        </span>
                        <div class="title-with-tooltip">
                            <h3>{{ card.title }}</h3>
                            <AppTooltip v-if="card.tooltip" :text="card.tooltip" />
                        </div>
                    </div>

                    <strong>{{ card.value }}</strong>
                    <p v-if="card.description" class="metric-description">{{ card.description }}</p>

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
                        <div class="chart-title-copy">
                            <div class="title-with-tooltip">
                                <h3>Receitas x Despesas</h3>
                                <AppTooltip :text="recommendedLimitDescription" />
                            </div>
                            <p class="hint-text" v-if="!hasAnyMovement">Ainda sem movimentações no ano selecionado.</p>
                            <p class="hint-text" v-else>{{ barRangeLabel }}</p>
                        </div>
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
                    <div class="chart-holder">
                        <canvas ref="incomeExpenseCanvas" />
                    </div>
                </article>

                <article class="chart-card expense-categories-card">
                    <div class="title-with-tooltip">
                        <h3>Despesas por categoria</h3>
                        <AppTooltip text="Distribuição das despesas do período entre as categorias registradas." />
                    </div>
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
                <article class="chart-card dashboard-trend-card">
                    <div class="dashboard-trend-header">
                        <div class="dashboard-trend-copy">
                            <div class="title-with-tooltip">
                                <h3>Análise de Tendência</h3>
                                <AppTooltip text="Evolução do saldo conforme o período selecionado." />
                            </div>
                        </div>

                        <div class="dashboard-trend-switch" role="tablist" aria-label="Tipo de tendência">
                            <button
                                v-for="option in TREND_VIEW_OPTIONS"
                                :key="option.id"
                                type="button"
                                class="dashboard-trend-switch-btn"
                                :aria-pressed="activeTrendView === option.id"
                                :class="[{ active: activeTrendView === option.id }, `is-${option.id}`]"
                                @click="activeTrendView = option.id"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="chart-holder chart-holder-trend dashboard-trend-chart-holder">
                        <canvas ref="trendCanvas" />
                    </div>
                </article>
            </section>
        </template>
    </section>
</template>
