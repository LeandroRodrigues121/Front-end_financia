<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Chart, registerables } from 'chart.js';
import AppIcon from '@/components/AppIcon.vue';
import { loadAnnualFinancialReport } from '@/services/reports/loadAnnualFinancialReport';
import { formatCurrency, monthName } from '@/utils/formatters';
import { monthShortLabel } from '@/utils/labels';

Chart.register(...registerables);

const currentYear = new Date().getFullYear();
const year = ref(currentYear);
const rows = ref([]);
const totals = ref({
    income_total: 0,
    expense_total: 0,
    balance: 0,
});
const loading = ref(false);
const toast = ref(null);
const annualCanvas = ref(null);
const exportMenuRef = ref(null);
const isExportMenuOpen = ref(false);
const isExportingExcel = ref(false);
const isExportingPdf = ref(false);

let annualChart = null;
let toastTimeout = null;

const annualMetricHelp = {
    income: 'Soma de todas as receitas registradas no ano selecionado.',
    expense: 'Total de despesas lançadas no ano selecionado.',
    balance: 'Diferença entre receitas e despesas ao longo do ano.',
    savings: 'Percentual da receita anual que permaneceu como saldo.',
    best: 'Mês com o melhor resultado líquido do período.',
    alert: 'Mês com o pior resultado líquido do período.',
};

const yearOptions = computed(() =>
    Array.from({ length: 6 }, (_, index) => currentYear - index),
);

const hasRows = computed(() => rows.value.length > 0);

const hasMeaningfulMovement = computed(() =>
    rows.value.some(
        (row) =>
            Number(row.income_total || 0) !== 0 ||
            Number(row.expense_total || 0) !== 0 ||
            Number(row.balance || 0) !== 0,
    ),
);

const positiveMonths = computed(() => rows.value.filter((row) => Number(row.balance || 0) >= 0).length);

const savingsRate = computed(() => {
    const income = Number(totals.value.income_total || 0);
    const balance = Number(totals.value.balance || 0);

    if (income <= 0) {
        return 0;
    }

    return (balance / income) * 100;
});

const bestMonth = computed(() => {
    if (!rows.value.length || !hasMeaningfulMovement.value) return null;
    return [...rows.value].sort((left, right) => Number(right.balance || 0) - Number(left.balance || 0))[0];
});

const worstMonth = computed(() => {
    if (!rows.value.length || !hasMeaningfulMovement.value) return null;
    return [...rows.value].sort((left, right) => Number(left.balance || 0) - Number(right.balance || 0))[0];
});

const legendItems = [
    { label: 'Receitas', className: 'is-income' },
    { label: 'Despesas', className: 'is-expense' },
    { label: 'Acumulado', className: 'is-accumulated' },
];

const capitalizeLabel = (value) => {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
};

const formatMonthLabel = (monthValue) => capitalizeLabel(monthName(monthValue));

const formatPercent = (value) =>
    `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(Number(value || 0))}%`;

const formatCurrencyParts = (value) => {
    const amount = Number(value || 0);
    const parts = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).formatToParts(Math.abs(amount));

    const symbol = parts
        .filter((part) => part.type === 'currency')
        .map((part) => part.value)
        .join('') || 'R$';

    const number = parts
        .filter((part) => !['currency', 'literal'].includes(part.type))
        .map((part) => part.value)
        .join('');

    return {
        sign: amount < 0 ? '-' : '',
        symbol,
        number,
    };
};

const formatAxisValue = (value) =>
    new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0,
    }).format(Number(value || 0));

const formatSignedCurrency = (value) => {
    const amount = Number(value || 0);
    const formatted = formatCurrency(Math.abs(amount));

    if (amount > 0) return `+ ${formatted}`;
    if (amount < 0) return `- ${formatted}`;
    return formatted;
};

const balanceToneClass = (value) => (Number(value || 0) >= 0 ? 'is-positive' : 'is-negative');

const balanceStatusLabel = (value) => (Number(value || 0) >= 0 ? 'Positivo' : 'Défice');

const incomeDisplay = computed(() => formatCurrencyParts(totals.value.income_total));
const expenseDisplay = computed(() => formatCurrencyParts(totals.value.expense_total));
const balanceDisplay = computed(() => formatCurrencyParts(totals.value.balance));

const clearToast = () => {
    if (toastTimeout) {
        window.clearTimeout(toastTimeout);
        toastTimeout = null;
    }

    toast.value = null;
};

const showToast = (type, text, duration = 4200) => {
    clearToast();
    toast.value = { type, text };
    toastTimeout = window.setTimeout(() => {
        toast.value = null;
        toastTimeout = null;
    }, duration);
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const buildExportDocument = () => {
    const chartImage = annualCanvas.value && hasRows.value ? annualCanvas.value.toDataURL('image/png') : '';
    const tableRows = hasRows.value
        ? rows.value
              .map(
                  (row) => `
                    <tr>
                        <td>${escapeHtml(formatMonthLabel(row.month))}</td>
                        <td class="cell-right">${escapeHtml(formatCurrency(row.income_total))}</td>
                        <td class="cell-right">${escapeHtml(formatCurrency(row.expense_total))}</td>
                        <td class="cell-right ${Number(row.balance || 0) >= 0 ? 'tone-positive' : 'tone-negative'}">
                            ${escapeHtml(formatCurrency(row.balance))}
                        </td>
                        <td class="cell-right strong">${escapeHtml(formatCurrency(row.accumulated_balance))}</td>
                        <td class="cell-center">
                            <span class="status-chip ${Number(row.balance || 0) >= 0 ? 'status-positive' : 'status-negative'}">
                                ${escapeHtml(balanceStatusLabel(row.balance))}
                            </span>
                        </td>
                    </tr>
                `,
              )
              .join('')
        : `
            <tr>
                <td colspan="6" class="empty-row">Nenhum dado encontrado para este período.</td>
            </tr>
        `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Visão Anual ${escapeHtml(year.value)}</title>
    <style>
        :root {
            color-scheme: light;
            --ink: #15304b;
            --muted: #7a8aa1;
            --line: #dbe4ef;
            --surface: #ffffff;
            --success: #0ea5a0;
            --danger: #f43f5e;
            --accent: #5450e7;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 32px;
            background: #eef3f8;
            color: var(--ink);
            font-family: "Segoe UI", Arial, sans-serif;
        }
        .sheet {
            max-width: 1180px;
            margin: 0 auto;
            display: grid;
            gap: 22px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 20px;
        }
        .header h1 {
            margin: 0 0 8px;
            font-size: 2rem;
        }
        .header p {
            margin: 0;
            color: var(--muted);
        }
        .stamp {
            text-align: right;
            color: var(--muted);
            font-size: 0.9rem;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 16px;
        }
        .metric {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 22px;
            padding: 24px;
            min-height: 136px;
        }
        .metric h2 {
            margin: 0;
            color: #90a1b8;
            font-size: 0.66rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.16em;
        }
        .metric strong {
            display: block;
            margin-top: 16px;
            font-size: 1.55rem;
            line-height: 1.08;
        }
        .metric p {
            margin: 12px 0 0;
            font-size: 0.78rem;
            line-height: 1.4;
            color: var(--muted);
        }
        .metric.balance {
            box-shadow: inset 4px 0 0 #14b8a6;
        }
        .metric.savings {
            background: #edf1ff;
            border-color: #d8defd;
        }
        .metric.savings strong {
            color: #4f46e5;
        }
        .metric.expense strong,
        .metric.alert strong,
        .tone-negative {
            color: var(--danger);
        }
        .metric.balance strong,
        .metric.best p,
        .tone-positive {
            color: var(--success);
        }
        .metric.alert {
            background: #fff2f4;
            border-color: #ffd6de;
        }
        .block {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 24px;
            padding: 24px 28px;
        }
        .block-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 18px;
        }
        .block-head h2 {
            margin: 0 0 8px;
            font-size: 1.5rem;
        }
        .block-head p {
            margin: 0;
            color: var(--muted);
        }
        .legend {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 18px;
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .legend span {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .legend i {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 4px;
            background: var(--success);
        }
        .legend .expense {
            background: var(--danger);
        }
        .legend .accumulated {
            width: 18px;
            height: 4px;
            border-radius: 999px;
            background: var(--accent);
        }
        .chart img {
            width: 100%;
            display: block;
            border-radius: 18px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th,
        td {
            padding: 16px 14px;
            border-bottom: 1px solid #edf1f6;
            font-size: 0.94rem;
        }
        th {
            color: #90a1b8;
            font-size: 0.78rem;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            text-align: left;
        }
        .cell-right { text-align: right; }
        .cell-center { text-align: center; }
        .strong {
            font-weight: 800;
            color: var(--ink);
        }
        .status-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 88px;
            padding: 7px 10px;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 800;
            text-transform: uppercase;
        }
        .status-positive {
            background: #dcfce7;
            color: #0f8c68;
        }
        .status-negative {
            background: #ffe4e8;
            color: #e11d48;
        }
        .empty-row {
            padding: 28px 14px;
            text-align: center;
            color: var(--muted);
        }
    </style>
</head>
<body>
    <main class="sheet">
        <header class="header">
            <div>
                <h1>Visão Anual</h1>
                <p>Análise consolidada de desempenho, tendência e saúde financeira.</p>
            </div>
            <div class="stamp">
                <div>Ano ${escapeHtml(year.value)}</div>
                <div>Gerado em ${escapeHtml(
                    new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                    }).format(new Date()),
                )}</div>
            </div>
        </header>
        <section class="metrics">
            <article class="metric">
                <h2>Receita Anual</h2>
                <strong>${escapeHtml(formatCurrency(totals.value.income_total))}</strong>
                <p>Fluxo bruto acumulado no ano.</p>
            </article>
            <article class="metric expense">
                <h2>Despesa Anual</h2>
                <strong>${escapeHtml(formatCurrency(totals.value.expense_total))}</strong>
                <p>Saídas totais registradas.</p>
            </article>
            <article class="metric balance">
                <h2>Saldo Anual</h2>
                <strong>${escapeHtml(formatCurrency(totals.value.balance))}</strong>
                <p>Resultado consolidado entre receitas e despesas.</p>
            </article>
            <article class="metric savings">
                <h2>Taxa de Poupança</h2>
                <strong>${escapeHtml(formatPercent(savingsRate.value))}</strong>
                <p>${escapeHtml(positiveMonths.value)}/12 meses sem défice.</p>
            </article>
            <article class="metric best">
                <h2>Melhor Mês</h2>
                <strong>${escapeHtml(bestMonth.value ? formatMonthLabel(bestMonth.value.month) : '-')}</strong>
                <p>${escapeHtml(bestMonth.value ? formatSignedCurrency(bestMonth.value.balance) : 'Sem movimentações')}</p>
            </article>
            <article class="metric alert">
                <h2>Mês de Alerta</h2>
                <strong>${escapeHtml(worstMonth.value ? formatMonthLabel(worstMonth.value.month) : '-')}</strong>
                <p>${escapeHtml(worstMonth.value ? formatSignedCurrency(worstMonth.value.balance) : 'Sem movimentações')}</p>
            </article>
        </section>
        <section class="block">
            <div class="block-head">
                <div>
                    <h2>Tendência Anual</h2>
                    <p>Fluxo mensal (barras) vs Saldo acumulado (linha).</p>
                </div>
                <div class="legend">
                    <span><i></i>Receitas</span>
                    <span><i class="expense"></i>Despesas</span>
                    <span><i class="accumulated"></i>Acumulado</span>
                </div>
            </div>
            ${chartImage ? `<div class="chart"><img src="${chartImage}" alt="Gráfico anual" /></div>` : ''}
        </section>
        <section class="block">
            <div class="block-head">
                <div>
                    <h2>Resumo Mês a Mês</h2>
                    <p>Leitura detalhada do desempenho mensal do período.</p>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Mês</th>
                        <th class="cell-right">Receitas</th>
                        <th class="cell-right">Despesas</th>
                        <th class="cell-right">Resultado</th>
                        <th class="cell-right">Acumulado</th>
                        <th class="cell-center">Status</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </section>
    </main>
</body>
</html>`;
};

const closeExportMenu = () => {
    isExportMenuOpen.value = false;
};

const toggleExportMenu = () => {
    isExportMenuOpen.value = !isExportMenuOpen.value;
};

const exportToPdf = async () => {
    if (isExportingPdf.value) return;

    clearToast();
    closeExportMenu();
    isExportingPdf.value = true;

    try {
        const { generateAnnualFinancialPdf } = await import('@/services/reports/generateAnnualFinancialPdf');
        const report = await loadAnnualFinancialReport({
            year: year.value,
            generatedAt: new Date(),
        });

        await generateAnnualFinancialPdf(report);
        showToast('success', 'PDF anual gerado com sucesso.');
    } catch {
        showToast('error', 'Não foi possível exportar o PDF anual.');
    } finally {
        isExportingPdf.value = false;
    }
};

const exportToExcel = async () => {
    if (isExportingExcel.value) return;

    clearToast();
    closeExportMenu();
    isExportingExcel.value = true;

    try {
        const { generateAnnualFinancialExcel } = await import('@/services/reports/generateAnnualFinancialExcel');
        const report = await loadAnnualFinancialReport({
            year: year.value,
            generatedAt: new Date(),
        });

        await generateAnnualFinancialExcel(report);
        showToast('success', 'Excel anual gerado com sucesso.');
    } catch {
        showToast('error', 'Não foi possível exportar o Excel anual.');
    } finally {
        isExportingExcel.value = false;
    }
};

const renderAnnualChart = () => {
    if (!annualCanvas.value) return;

    if (annualChart) {
        annualChart.destroy();
        annualChart = null;
    }

    if (!rows.value.length) return;

    const context = annualCanvas.value.getContext('2d');
    if (!context) return;

    const accumulatedGradient = context.createLinearGradient(0, 0, 0, 360);
    accumulatedGradient.addColorStop(0, 'rgba(84, 80, 231, 0.22)');
    accumulatedGradient.addColorStop(1, 'rgba(84, 80, 231, 0.04)');

    annualChart = new Chart(context, {
        data: {
            labels: rows.value.map((row) => monthShortLabel(row.month)),
            datasets: [
                {
                    type: 'bar',
                    label: 'Receitas',
                    data: rows.value.map((row) => Number(row.income_total || 0)),
                    backgroundColor: 'rgba(20, 184, 166, 0.72)',
                    hoverBackgroundColor: 'rgba(15, 165, 152, 0.86)',
                    borderRadius: 8,
                    borderSkipped: false,
                    barPercentage: 0.9,
                    categoryPercentage: 0.62,
                    yAxisID: 'y',
                },
                {
                    type: 'bar',
                    label: 'Despesas',
                    data: rows.value.map((row) => Number(row.expense_total || 0)),
                    backgroundColor: 'rgba(244, 63, 94, 0.76)',
                    hoverBackgroundColor: 'rgba(225, 29, 72, 0.86)',
                    borderRadius: 8,
                    borderSkipped: false,
                    barPercentage: 0.9,
                    categoryPercentage: 0.62,
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Acumulado',
                    data: rows.value.map((row) => Number(row.accumulated_balance || 0)),
                    borderColor: '#5450e7',
                    backgroundColor: accumulatedGradient,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 4,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    pointBorderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#5450e7',
                    yAxisID: 'y1',
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
                    display: false,
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 12,
                    displayColors: true,
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
                        color: 'rgba(148, 163, 184, 0.18)',
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#62748a',
                        font: {
                            size: 12,
                            weight: 600,
                        },
                    },
                },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(148, 163, 184, 0.18)',
                        drawBorder: false,
                    },
                    title: {
                        display: true,
                        text: 'Fluxo Mensal (R$)',
                        color: '#62748a',
                        font: {
                            size: 12,
                            weight: 700,
                        },
                    },
                    ticks: {
                        color: '#62748a',
                        callback: (value) => formatAxisValue(value),
                    },
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false,
                        drawBorder: false,
                    },
                    title: {
                        display: true,
                        text: 'Saldo Acumulado (R$)',
                        color: '#62748a',
                        font: {
                            size: 12,
                            weight: 700,
                        },
                    },
                    ticks: {
                        color: '#62748a',
                        callback: (value) => formatAxisValue(value),
                    },
                },
            },
        },
    });
};

const loadReport = async () => {
    loading.value = true;
    clearToast();

    const previousRows = [...rows.value];
    const previousTotals = { ...totals.value };

    try {
        const report = await loadAnnualFinancialReport({
            year: year.value,
            generatedAt: new Date(),
        });

        rows.value = report.rows;
        totals.value = report.totals;

        await nextTick();
        renderAnnualChart();
    } catch {
        rows.value = previousRows;
        totals.value = previousTotals;

        await nextTick();
        renderAnnualChart();

        showToast('error', 'Não foi possível carregar o relatório anual.');
    } finally {
        loading.value = false;
    }
};

const handleDocumentClick = (event) => {
    if (!isExportMenuOpen.value) return;

    const target = event.target;
    if (exportMenuRef.value?.contains(target)) return;

    closeExportMenu();
};

const handleWindowKeydown = (event) => {
    if (event.key === 'Escape' && isExportMenuOpen.value) {
        closeExportMenu();
    }
};

onMounted(() => {
    loadReport();
    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
    clearToast();
    document.removeEventListener('click', handleDocumentClick);
    window.removeEventListener('keydown', handleWindowKeydown);

    if (annualChart) {
        annualChart.destroy();
        annualChart = null;
    }
});
</script>

<template>
    <section class="page annual-report-page">
        <header class="page-header annual-page-header">
            <div class="annual-page-heading">
                <h2>Visão Anual</h2>
                <p>Análise consolidada de desempenho, tendência e saúde financeira.</p>
            </div>

            <div class="annual-toolbar">
                <label class="annual-year-field">
                    <span>Ano</span>
                    <select v-model.number="year">
                        <option v-for="option in yearOptions" :key="option" :value="option">
                            {{ option }}
                        </option>
                    </select>
                </label>

                <div ref="exportMenuRef" class="export-menu">
                    <button
                        class="btn-ghost incomes-export-trigger"
                        type="button"
                        :disabled="loading || isExportingPdf || isExportingExcel || !hasRows"
                        aria-haspopup="menu"
                        :aria-expanded="isExportMenuOpen"
                        @click.stop="toggleExportMenu"
                    >
                        <AppIcon name="download" :size="17" />
                        <span>Exportar</span>
                        <AppIcon name="chevronDown" :size="16" />
                    </button>

                    <div v-if="isExportMenuOpen" class="export-menu-panel" role="menu" aria-label="Opções de exportação">
                        <button
                            class="export-menu-item export-menu-item-pdf"
                            type="button"
                            role="menuitem"
                            :disabled="loading || isExportingPdf || isExportingExcel"
                            @click="exportToPdf"
                        >
                            <AppIcon name="fileText" :size="16" />
                            <span>
                                <strong>{{ isExportingPdf ? 'Gerando PDF...' : 'Exportar PDF' }}</strong>
                                <small>
                                    {{
                                        isExportingPdf
                                            ? 'Montando o relatório anual com o layout executivo.'
                                            : 'Relatório anual em PDF no modelo aprovado pelo protótipo.'
                                    }}
                                </small>
                            </span>
                        </button>

                        <button
                            class="export-menu-item export-menu-item-excel"
                            type="button"
                            role="menuitem"
                            :disabled="loading || isExportingPdf || isExportingExcel"
                            @click="exportToExcel"
                        >
                            <AppIcon name="fileSpreadsheet" :size="16" />
                            <span>
                                <strong>{{ isExportingExcel ? 'Gerando Excel...' : 'Exportar Excel' }}</strong>
                                <small>
                                    {{
                                        isExportingExcel
                                            ? 'Montando a planilha anual no formato do balanço.'
                                            : 'Planilha .xlsx com o layout do balanço anual do protótipo.'
                                    }}
                                </small>
                            </span>
                        </button>
                    </div>
                </div>

                <button
                    class="annual-action annual-action--primary"
                    type="button"
                    :disabled="loading"
                    @click="loadReport"
                >
                    <AppIcon name="refresh" :size="16" :class="{ 'is-spinning': loading }" />
                    <span>{{ loading ? 'Atualizando...' : 'Atualizar' }}</span>
                </button>
            </div>
        </header>

        <Transition name="annual-toast">
            <aside v-if="toast" class="annual-toast" :class="toast.type === 'error' ? 'is-error' : 'is-success'">
                <div class="annual-toast__icon">
                    <AppIcon :name="toast.type === 'error' ? 'alert' : 'check'" :size="16" />
                </div>
                <div class="annual-toast__body">
                    <strong>{{ toast.type === 'error' ? 'Aviso do sistema' : 'Ação concluída' }}</strong>
                    <p>{{ toast.text }}</p>
                </div>
                <button class="annual-toast__close" type="button" @click="clearToast" aria-label="Fechar aviso">
                    <AppIcon name="close" :size="14" />
                </button>
            </aside>
        </Transition>

        <div v-if="loading && !hasRows" class="panel panel-loading annual-loading-state">
            Carregando consolidação anual...
        </div>

        <section class="cards-grid annual-metrics-grid annual-report-grid">
            <article class="metric-card annual-metric-card">
                <div class="annual-metric-heading">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Receita Anual</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.income"
                            :data-tooltip="annualMetricHelp.income"
                        >
                            ?
                        </button>
                    </div>
                </div>
                <div class="annual-metric-value">
                    <span v-if="incomeDisplay.sign" class="annual-currency-sign">{{ incomeDisplay.sign }}</span>
                    <span class="annual-currency-symbol">{{ incomeDisplay.symbol }}</span>
                    <span class="annual-currency-number">{{ incomeDisplay.number }}</span>
                </div>
                <p class="annual-metric-caption">Fluxo bruto consolidado no período.</p>
            </article>

            <article class="metric-card annual-metric-card annual-metric-card--expense">
                <div class="annual-metric-heading">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Despesa Anual</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.expense"
                            :data-tooltip="annualMetricHelp.expense"
                        >
                            ?
                        </button>
                    </div>
                </div>
                <div class="annual-metric-value">
                    <span v-if="expenseDisplay.sign" class="annual-currency-sign">{{ expenseDisplay.sign }}</span>
                    <span class="annual-currency-symbol">{{ expenseDisplay.symbol }}</span>
                    <span class="annual-currency-number">{{ expenseDisplay.number }}</span>
                </div>
                <p class="annual-metric-caption">Saídas totais registradas no ano.</p>
            </article>

            <article
                class="metric-card annual-metric-card annual-metric-card--balance"
                :class="Number(totals.balance) >= 0 ? 'tone-positive' : 'tone-danger'"
            >
                <div class="annual-metric-heading">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Saldo Anual</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.balance"
                            :data-tooltip="annualMetricHelp.balance"
                        >
                            ?
                        </button>
                    </div>
                </div>
                <div class="annual-metric-value">
                    <span v-if="balanceDisplay.sign" class="annual-currency-sign">{{ balanceDisplay.sign }}</span>
                    <span class="annual-currency-symbol">{{ balanceDisplay.symbol }}</span>
                    <span class="annual-currency-number">{{ balanceDisplay.number }}</span>
                </div>
                <p class="annual-metric-caption">Resultado consolidado entre receitas e despesas.</p>
            </article>

            <article class="metric-card annual-metric-card annual-metric-card--savings">
                <div class="annual-metric-head">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Taxa de Poupança</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.savings"
                            :data-tooltip="annualMetricHelp.savings"
                        >
                            ?
                        </button>
                    </div>
                    <span class="annual-metric-icon">
                        <AppIcon name="trendUp" :size="14" />
                    </span>
                </div>
                <div class="annual-metric-figure annual-metric-figure--accent">{{ formatPercent(savingsRate) }}</div>
                <p class="annual-metric-caption">{{ positiveMonths }}/12 meses sem défice.</p>
            </article>

            <article class="metric-card annual-metric-card annual-metric-card--best">
                <div class="annual-metric-heading">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Melhor Mês</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.best"
                            :data-tooltip="annualMetricHelp.best"
                        >
                            ?
                        </button>
                    </div>
                </div>
                <div class="annual-metric-figure">{{ bestMonth ? formatMonthLabel(bestMonth.month) : '-' }}</div>
                <p class="annual-metric-caption">
                    {{ bestMonth ? formatSignedCurrency(bestMonth.balance) : 'Sem movimentações' }}
                </p>
            </article>

            <article class="metric-card annual-metric-card annual-metric-card--alert">
                <div class="annual-metric-heading">
                    <div class="annual-metric-title-group">
                        <div class="annual-metric-label">Mês de Alerta</div>
                        <button
                            class="annual-metric-help"
                            type="button"
                            :aria-label="annualMetricHelp.alert"
                            :data-tooltip="annualMetricHelp.alert"
                        >
                            ?
                        </button>
                    </div>
                </div>
                <div class="annual-metric-figure">{{ worstMonth ? formatMonthLabel(worstMonth.month) : '-' }}</div>
                <p class="annual-metric-caption">
                    {{ worstMonth ? formatSignedCurrency(worstMonth.balance) : 'Sem movimentações' }}
                </p>
            </article>
        </section>

        <article class="chart-card annual-chart-card">
            <div class="annual-chart-card__header">
                <div>
                    <h3>Tendência Anual</h3>
                    <p class="hint-text">Fluxo mensal (barras) vs Saldo acumulado (linha).</p>
                </div>

                <div class="annual-chart-card__legend" aria-label="Legenda do gráfico">
                    <span
                        v-for="item in legendItems"
                        :key="item.label"
                        class="annual-chart-card__legend-item"
                    >
                        <i :class="['annual-chart-card__legend-swatch', item.className]" />
                        {{ item.label }}
                    </span>
                </div>
            </div>

            <div v-if="hasRows" class="annual-chart-holder">
                <canvas ref="annualCanvas" />
            </div>

            <div v-else class="empty-state annual-empty-state">
                <AppIcon :name="loading ? 'refresh' : 'annual'" :size="20" />
                <p v-if="loading">Preparando o gráfico anual...</p>
                <p v-else>Nenhum dado anual encontrado para o período selecionado.</p>
            </div>
        </article>

        <article class="panel annual-table-panel">
            <div class="annual-table-panel__header">
                <div>
                    <h3>Resumo Mês a Mês</h3>
                    <p class="hint-text">Leitura detalhada do desempenho mensal do ano selecionado.</p>
                </div>
            </div>

            <div class="table-wrap annual-table-wrap">
                <table v-if="hasRows" class="annual-report-table">
                    <thead>
                        <tr>
                            <th>Mês</th>
                            <th class="is-right">Receitas</th>
                            <th class="is-right">Despesas</th>
                            <th class="is-right">Resultado</th>
                            <th class="is-right">Acumulado</th>
                            <th class="is-center">Status</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr
                            v-for="row in rows"
                            :key="row.month"
                            class="annual-report-table__row"
                            :class="Number(row.balance || 0) < 0 ? 'is-alert' : ''"
                        >
                            <td class="annual-report-table__month">
                                {{ formatMonthLabel(row.month) }}
                            </td>
                            <td class="is-right">{{ formatCurrency(row.income_total) }}</td>
                            <td class="is-right">{{ formatCurrency(row.expense_total) }}</td>
                            <td class="is-right annual-report-table__result" :class="balanceToneClass(row.balance)">
                                {{ formatCurrency(row.balance) }}
                            </td>
                            <td class="is-right annual-report-table__accumulated">
                                {{ formatCurrency(row.accumulated_balance) }}
                            </td>
                            <td class="is-center">
                                <span class="annual-status-pill" :class="balanceToneClass(row.balance)">
                                    {{ balanceStatusLabel(row.balance) }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-else class="empty-state annual-empty-state">
                    <AppIcon :name="loading ? 'refresh' : 'annual'" :size="20" />
                    <p v-if="loading">Carregando dados anuais...</p>
                    <p v-else>Nenhum dado anual encontrado.</p>
                </div>
            </div>
        </article>
    </section>
</template>

<style scoped>
.annual-report-page {
    --annual-ink: #16324d;
    --annual-muted: #7a8aa1;
    --annual-border: #dbe4ef;
    --annual-border-strong: #c9d7e6;
    --annual-shadow: 0 18px 34px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04);
    --annual-success: #0ea5a0;
    --annual-success-soft: #dcfce7;
    --annual-danger: #f43f5e;
    --annual-danger-soft: #ffe4e8;
    --annual-accent: #5450e7;
    gap: 24px;
}

.annual-page-header {
    align-items: flex-start;
    gap: 20px;
}

.annual-page-heading {
    display: grid;
    gap: 6px;
}

.annual-page-heading h2 {
    margin: 0;
    font-size: clamp(2rem, 2.8vw, 3rem);
    line-height: 1;
    color: var(--annual-ink);
    letter-spacing: -0.04em;
}

.annual-page-heading p {
    margin: 0;
    max-width: 60ch;
    color: var(--annual-muted);
    font-size: 1rem;
}

.annual-toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
    margin-left: auto;
}

.annual-year-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 138px;
    padding: 8px 12px;
    border: 1px solid var(--annual-border);
    border-radius: 16px;
    background: #ffffff;
    box-shadow: var(--annual-shadow);
}

.annual-year-field span {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9aa9be;
}

.annual-year-field select {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--annual-ink);
}

.annual-year-field select:focus {
    outline: none;
}

.annual-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 58px;
    padding: 0 20px;
    border-radius: 18px;
    border: 1px solid var(--annual-border);
    background: #ffffff;
    color: var(--annual-ink);
    box-shadow: var(--annual-shadow);
    font-size: 1rem;
    font-weight: 700;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.annual-action:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--annual-border-strong);
}

.annual-action:disabled {
    cursor: not-allowed;
    opacity: 0.58;
}

.annual-action--primary {
    border-color: transparent;
    background: linear-gradient(135deg, #0f9b93 0%, #0b8f8a 100%);
    color: #ffffff;
}

.annual-action--primary:hover:not(:disabled) {
    box-shadow: 0 20px 30px rgba(14, 165, 160, 0.22);
}

.annual-toast {
    position: fixed;
    top: 28px;
    right: 30px;
    z-index: 40;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 12px;
    width: min(360px, calc(100vw - 32px));
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid var(--annual-border);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(18px);
}

.annual-toast.is-success {
    border-color: rgba(14, 165, 160, 0.24);
}

.annual-toast.is-error {
    border-color: rgba(244, 63, 94, 0.24);
}

.annual-toast__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-top: 2px;
    border-radius: 10px;
    background: #eef7f6;
    color: var(--annual-success);
}

.annual-toast.is-error .annual-toast__icon {
    background: #fff1f4;
    color: var(--annual-danger);
}

.annual-toast__body {
    display: grid;
    gap: 4px;
}

.annual-toast__body strong {
    color: var(--annual-ink);
    font-size: 0.88rem;
    line-height: 1.2;
}

.annual-toast__body p {
    margin: 0;
    color: var(--annual-muted);
    font-size: 0.82rem;
    line-height: 1.35;
}

.annual-toast__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-top: 1px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #7f8da3;
    transition: background 0.16s ease, color 0.16s ease;
}

.annual-toast__close:hover {
    background: rgba(148, 163, 184, 0.12);
    color: var(--annual-ink);
}

.annual-toast-enter-active,
.annual-toast-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.annual-toast-enter-from,
.annual-toast-leave-to {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
}

.annual-loading-state {
    min-height: 144px;
    border-radius: 24px;
    background: #ffffff;
    border-color: var(--annual-border);
    box-shadow: var(--annual-shadow);
}

.annual-report-grid {
    gap: 18px;
}

.annual-metric-card {
    min-height: 166px;
    padding: 24px;
    border-radius: 24px;
    border-color: var(--annual-border);
    box-shadow: var(--annual-shadow);
    gap: 14px;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.annual-metric-card:hover {
    transform: translateY(-3px);
    border-color: var(--annual-border-strong);
}

.annual-metric-label {
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #96a4bb;
}

.annual-metric-heading,
.annual-metric-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.annual-metric-title-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.annual-metric-help {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.14);
    color: #7b8aa0;
    font-size: 0.65rem;
    font-weight: 900;
    line-height: 1;
    cursor: help;
    flex: 0 0 auto;
}

.annual-metric-help::after {
    content: attr(data-tooltip);
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    width: 210px;
    padding: 9px 10px;
    border-radius: 12px;
    background: #13263a;
    color: #f8fbff;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.35;
    text-align: left;
    box-shadow: 0 14px 24px rgba(15, 23, 42, 0.22);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.annual-metric-help:hover::after,
.annual-metric-help:focus-visible::after {
    opacity: 1;
    transform: translateY(0);
}

.annual-metric-help:focus-visible {
    outline: 2px solid rgba(84, 80, 231, 0.28);
    outline-offset: 2px;
}

.annual-metric-value,
.annual-metric-figure {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-height: 40px;
    color: var(--annual-ink);
    font-size: clamp(1.5rem, 1.8vw, 1.85rem);
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.03em;
}

.annual-metric-figure--accent {
    color: var(--annual-accent);
}

.annual-currency-sign,
.annual-currency-symbol {
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0;
    color: #9aa9be;
}

.annual-currency-number {
    color: currentColor;
}

.annual-metric-caption {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--annual-muted);
}

.annual-metric-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 10px;
    color: var(--annual-accent);
    background: rgba(84, 80, 231, 0.12);
}

.annual-metric-card--expense .annual-metric-value,
.annual-metric-card--alert .annual-metric-figure,
.annual-metric-card--alert .annual-metric-caption {
    color: var(--annual-danger);
}

.annual-metric-card--balance {
    overflow: hidden;
}

.annual-metric-card--balance .annual-metric-label,
.annual-metric-card--balance .annual-metric-caption {
    color: var(--annual-muted);
}

.metric-card.annual-metric-card--balance::before {
    width: 5px;
    top: 0;
    bottom: 0;
    background: currentColor;
}

.annual-metric-card--balance.tone-positive .annual-metric-value {
    color: var(--annual-success);
}

.annual-metric-card--balance.tone-danger .annual-metric-value {
    color: var(--annual-danger);
}

.annual-metric-card--savings {
    background: linear-gradient(180deg, rgba(84, 80, 231, 0.08), rgba(84, 80, 231, 0.04));
    border-color: #dbe0fb;
}

.annual-metric-card--savings .annual-metric-caption {
    color: #636fd5;
}

.annual-metric-card--best .annual-metric-caption,
.annual-metric-card--alert .annual-metric-caption {
    font-weight: 700;
}

.annual-metric-card--best .annual-metric-caption {
    color: var(--annual-success);
}

.annual-chart-card,
.annual-table-panel {
    border-radius: 28px;
    border-color: var(--annual-border);
    box-shadow: var(--annual-shadow);
    padding: 0;
    overflow: hidden;
}

.annual-chart-card__header,
.annual-table-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 28px 32px 0;
}

.annual-chart-card h3,
.annual-table-panel h3 {
    margin: 0 0 6px;
    font-size: 1.75rem;
    color: var(--annual-ink);
    letter-spacing: -0.03em;
}

.annual-chart-card__header .hint-text,
.annual-table-panel__header .hint-text {
    margin: 0;
    color: var(--annual-muted);
    font-size: 1rem;
}

.annual-chart-card__legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 18px;
    padding-top: 6px;
}

.annual-chart-card__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    color: var(--annual-ink);
    font-size: 0.92rem;
    font-weight: 800;
    text-transform: uppercase;
}

.annual-chart-card__legend-swatch {
    display: inline-block;
    flex: 0 0 auto;
}

.annual-chart-card__legend-swatch.is-income,
.annual-chart-card__legend-swatch.is-expense {
    width: 16px;
    height: 16px;
    border-radius: 4px;
}

.annual-chart-card__legend-swatch.is-income {
    background: rgba(20, 184, 166, 0.9);
}

.annual-chart-card__legend-swatch.is-expense {
    background: rgba(244, 63, 94, 0.9);
}

.annual-chart-card__legend-swatch.is-accumulated {
    width: 18px;
    height: 4px;
    border-radius: 999px;
    background: var(--annual-accent);
}

.annual-chart-holder {
    height: 560px;
    padding: 18px 24px 28px;
}

.annual-table-wrap {
    margin-top: 0;
    padding: 14px 24px 12px;
}

.annual-report-table {
    min-width: 880px;
}

.annual-report-table th {
    border-bottom-color: #e8eef6;
    padding: 18px 14px;
    color: #97a6bc;
    font-size: 0.79rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.annual-report-table td {
    padding: 20px 14px;
    border-bottom-color: #eef3f8;
    color: #44566f;
    font-size: 1rem;
}

.annual-report-table__row {
    transition: background-color 0.16s ease;
}

.annual-report-table__row:hover {
    background: rgba(245, 248, 252, 0.86);
}

.annual-report-table__row.is-alert {
    background: rgba(244, 63, 94, 0.05);
}

.annual-report-table__month {
    font-weight: 800;
    color: var(--annual-ink);
}

.annual-report-table__result {
    font-weight: 800;
}

.annual-report-table__accumulated {
    font-weight: 900;
    color: var(--annual-ink);
}

.is-right {
    text-align: right;
}

.is-center {
    text-align: center;
}

.annual-status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 90px;
    padding: 7px 12px;
    border-radius: 10px;
    font-size: 0.78rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.annual-status-pill.is-positive {
    background: var(--annual-success-soft);
    color: #0f8c68;
}

.annual-status-pill.is-negative {
    background: var(--annual-danger-soft);
    color: #e11d48;
}

.is-positive {
    color: var(--annual-success);
}

.is-negative {
    color: var(--annual-danger);
}

.annual-empty-state {
    margin: 20px 24px 24px;
    min-height: 180px;
    border-style: solid;
    border-color: var(--annual-border);
    background: #f8fbff;
}

.is-spinning {
    animation: annual-spin 0.9s linear infinite;
}

@keyframes annual-spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 1100px) {
    .annual-page-header {
        flex-direction: column;
        align-items: stretch;
    }

    .annual-toolbar {
        justify-content: stretch;
        margin-left: 0;
    }

    .annual-year-field,
    .annual-action,
    .export-menu,
    .incomes-export-trigger {
        flex: 1 1 220px;
    }
}

@media (max-width: 900px) {
    .annual-report-page {
        gap: 20px;
    }

    .annual-toast {
        top: 18px;
        right: 18px;
    }

    .annual-chart-card__header,
    .annual-table-panel__header {
        padding: 24px 24px 0;
    }

    .annual-chart-holder {
        height: 470px;
        padding: 18px 16px 22px;
    }

    .annual-table-wrap {
        padding: 12px 16px 8px;
    }
}

@media (max-width: 720px) {
    .annual-page-heading h2 {
        font-size: 2.35rem;
    }

    .annual-toolbar {
        flex-direction: column;
    }

    .annual-year-field,
    .annual-action,
    .export-menu,
    .incomes-export-trigger,
    .export-menu-panel {
        width: 100%;
    }

    .annual-year-field {
        justify-content: space-between;
    }

    .annual-year-field select {
        font-size: 1.35rem;
    }

    .annual-chart-card__header,
    .annual-table-panel__header {
        gap: 12px;
        padding: 22px 18px 0;
    }

    .annual-chart-card h3,
    .annual-table-panel h3 {
        font-size: 1.45rem;
    }

    .annual-chart-card__legend {
        justify-content: flex-start;
        gap: 14px;
    }

    .annual-chart-holder {
        height: 400px;
        padding: 12px 10px 18px;
    }

    .annual-metric-card {
        min-height: 148px;
        padding: 18px;
    }

    .annual-metric-value,
    .annual-metric-figure {
        font-size: 1.55rem;
    }

    .annual-metric-help::after {
        width: 180px;
    }
}
</style>
