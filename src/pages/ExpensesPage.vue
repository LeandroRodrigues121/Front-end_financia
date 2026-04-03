<script setup>
import { Chart, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '@/services/api';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal.vue';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { expenseCategoryLabel, monthOptions, statusLabel, statusTone } from '@/utils/labels';

Chart.register(...registerables);

const ROWS_PER_PAGE = 5;

const expenseStatuses = [
    { value: 'paga', label: 'Paga' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'atrasada', label: 'Atrasada' },
];

const categoryPalette = {
    moradia: '#e11d48',
    alimentacao: '#fb7185',
    transporte: '#f97316',
    lazer: '#f59e0b',
    saude: '#0ea5e9',
    educacao: '#8b5cf6',
    contas_fixas: '#334155',
    outros: '#cbd5e1',
};

const defaultPaymentMethods = ['Nubank', 'Itau', 'Pix', 'Debito automatico', 'Dinheiro'];

const getTodayInputValue = () => {
    const now = new Date();
    const timezoneAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return timezoneAdjusted.toISOString().slice(0, 10);
};

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const parseCurrencyInput = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const rawValue = String(value || '')
        .trim()
        .replace(/^R\$\s*/i, '')
        .replace(/\s+/g, '');

    if (!rawValue) return 0;

    if (rawValue.includes(',')) {
        const normalized = rawValue.replace(/\./g, '');
        const [integerPart, decimalPart = ''] = normalized.split(',');
        const safeInteger = integerPart.replace(/\D/g, '') || '0';
        const safeDecimal = decimalPart.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
        return Number(`${safeInteger}.${safeDecimal}`);
    }

    if (rawValue.includes('.')) {
        const dotSections = rawValue.split('.');
        const looksLikeThousands = dotSections.length > 2 || dotSections[dotSections.length - 1]?.length === 3;

        if (looksLikeThousands) {
            const digits = rawValue.replace(/\D/g, '');
            return digits ? Number(digits) : 0;
        }

        const [integerPart, decimalPart = ''] = rawValue.split('.');
        const safeInteger = integerPart.replace(/\D/g, '') || '0';
        const safeDecimal = decimalPart.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
        return Number(`${safeInteger}.${safeDecimal}`);
    }

    const digits = rawValue.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    return digits ? Number(digits) : 0;
};

const sanitizeCurrencyDraft = (value) => {
    const rawValue = String(value || '')
        .replace(/^R\$\s*/i, '')
        .replace(/\s+/g, '')
        .replace(/\./g, ',')
        .replace(/[^\d,]/g, '');

    if (!rawValue) return '';

    const [integerPart = '', ...decimalRest] = rawValue.split(',');
    const safeInteger = integerPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';

    if (!decimalRest.length) {
        return safeInteger;
    }

    const safeDecimal = decimalRest.join('').replace(/\D/g, '').slice(0, 2);
    return safeDecimal ? `${safeInteger},${safeDecimal}` : safeInteger;
};

const formatCurrencyInput = (value) => {
    const amount = parseCurrencyInput(value);
    if (!amount) return '';

    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

const toCurrencyDraft = (value) => {
    const amount = parseCurrencyInput(value);
    if (!amount) return '';

    const hasDecimals = Math.round(amount * 100) % 100 !== 0;
    if (!hasDecimals) {
        return String(Math.trunc(amount));
    }

    return amount.toFixed(2).replace('.', ',');
};

const createFormState = () => ({
    description: '',
    amount: '',
    date: getTodayInputValue(),
    category: 'moradia',
    payment_method: '',
    status: 'pendente',
    notes: '',
});

const createPreviousPeriodState = () => ({
    month: null,
    year: null,
    label: 'periodo anterior',
    totalAmount: 0,
    deltaAmount: 0,
    deltaPercentage: null,
});

const normalizePreviousPeriod = (value) => ({
    month: Number(value?.month || 0) || null,
    year: Number(value?.year || 0) || null,
    label: value?.label ? String(value.label) : 'periodo anterior',
    totalAmount: Number(value?.total_amount || 0),
    deltaAmount: Number(value?.delta_amount || 0),
    deltaPercentage:
        value?.delta_percentage === null || value?.delta_percentage === undefined
            ? null
            : Number(value.delta_percentage),
});

const paymentMethodLabel = (value) => String(value || '').trim() || 'Nao informado';

const form = reactive(createFormState());
const filters = reactive({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
});

const expenses = ref([]);
const totalAmount = ref(0);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const message = ref('');
const error = ref('');
const formError = ref('');
const editingId = ref(null);
const isFormOpen = ref(false);
const deleteTarget = ref(null);
const searchQuery = ref('');
const currentPage = ref(1);
const descriptionInput = ref(null);
const categoryChartCanvas = ref(null);
const exportMenuRef = ref(null);
const serverBreakdown = ref([]);
const previousPeriod = ref(createPreviousPeriodState());
const isExportMenuOpen = ref(false);
const fieldErrors = reactive({
    description: '',
    amount: '',
    date: '',
    category: '',
    status: '',
});

let categoryChart = null;
let messageTimeoutId = null;

const totalCount = computed(() => expenses.value.length);
const isDeleteModalOpen = computed(() => Boolean(deleteTarget.value));
const isAnyModalOpen = computed(() => isFormOpen.value || isDeleteModalOpen.value);

const periodLabel = computed(() => {
    const month = monthOptions.find((item) => item.value === Number(filters.month));
    return `${month?.label || 'mes'} de ${filters.year}`;
});

const yearOptions = computed(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([filters.year]);

    for (let year = currentYear + 1; year >= currentYear - 4; year -= 1) {
        years.add(year);
    }

    return [...years].sort((leftYear, rightYear) => rightYear - leftYear);
});

const paymentMethodSuggestions = computed(() => {
    const seen = new Set();
    const options = [];

    const pushOption = (value) => {
        const label = String(value || '').trim();
        if (!label) return;

        const key = normalizeText(label);
        if (seen.has(key)) return;

        seen.add(key);
        options.push(label);
    };

    defaultPaymentMethods.forEach(pushOption);
    expenses.value.forEach((expense) => pushOption(expense.payment_method));

    return options;
});

const filteredExpenses = computed(() => {
    const query = normalizeText(searchQuery.value);
    if (!query) return [...expenses.value];

    return expenses.value.filter((expense) =>
        [
            expense.description,
            expenseCategoryLabel(expense.category),
            paymentMethodLabel(expense.payment_method),
            statusLabel(expense.status),
            expense.notes,
        ]
            .map((value) => normalizeText(value))
            .some((value) => value.includes(query)),
    );
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredExpenses.value.length / ROWS_PER_PAGE)));

const paginatedExpenses = computed(() => {
    const startIndex = (currentPage.value - 1) * ROWS_PER_PAGE;
    return filteredExpenses.value.slice(startIndex, startIndex + ROWS_PER_PAGE);
});

const paginationPages = computed(() => {
    const total = totalPages.value;
    const current = currentPage.value;
    const start = Math.max(1, current - 1);
    const end = Math.min(total, start + 2);
    const adjustedStart = Math.max(1, end - 2);
    const pages = [];

    for (let page = adjustedStart; page <= end; page += 1) {
        pages.push(page);
    }

    return pages;
});

const categoryBreakdown = computed(() => {
    const rows = serverBreakdown.value.length
        ? serverBreakdown.value
              .map((item) => ({
                  value: item.category,
                  label: expenseCategoryLabel(item.category),
                  amount: Number(item.total_amount || 0),
                  count: Number(item.total_count || 0),
                  color: categoryPalette[item.category] || categoryPalette.outros,
              }))
              .filter((item) => item.amount > 0)
        : (() => {
              const totals = new Map();

              expenses.value.forEach((expense) => {
                  const key = String(expense.category || 'outros');
                  const currentItem = totals.get(key) || {
                      value: key,
                      label: expenseCategoryLabel(key),
                      amount: 0,
                      count: 0,
                      color: categoryPalette[key] || categoryPalette.outros,
                  };

                  currentItem.amount += Number(expense.amount || 0);
                  currentItem.count += 1;
                  totals.set(key, currentItem);
              });

              return [...totals.values()];
          })();

    const total = totalAmount.value || rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return rows
        .map((item) => ({
            ...item,
            share: total > 0 ? (Number(item.amount || 0) / total) * 100 : 0,
        }))
        .sort((leftCategory, rightCategory) => Number(rightCategory.amount) - Number(leftCategory.amount));
});

const hasCategoryData = computed(() => categoryBreakdown.value.length > 0);
const leadCategory = computed(() => categoryBreakdown.value[0] || null);

const paidExpenses = computed(() => expenses.value.filter((expense) => expense.status === 'paga'));
const overdueExpenses = computed(() => expenses.value.filter((expense) => expense.status === 'atrasada'));
const openExpenses = computed(() => expenses.value.filter((expense) => expense.status !== 'paga'));

const paidTotal = computed(() =>
    paidExpenses.value.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
);

const openTotal = computed(() =>
    openExpenses.value.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
);

const paidDescription = computed(() => {
    const count = paidExpenses.value.length;
    if (!count) return 'Nenhuma despesa paga neste periodo.';

    return `${count} ${count === 1 ? 'lancamento efetuado' : 'lancamentos efetuados'}`;
});

const openStateDescription = computed(() => {
    if (!openExpenses.value.length) {
        return 'Sem despesas em aberto no periodo.';
    }

    if (overdueExpenses.value.length) {
        return `${overdueExpenses.value.length} ${overdueExpenses.value.length === 1 ? 'despesa atrasada' : 'despesas atrasadas'} requer atencao.`;
    }

    const highestOpenExpense = [...openExpenses.value].sort(
        (leftExpense, rightExpense) => Number(rightExpense.amount) - Number(leftExpense.amount),
    )[0];

    return highestOpenExpense
        ? `Maior pendencia em ${expenseCategoryLabel(highestOpenExpense.category)}.`
        : 'Acompanhe os proximos pagamentos.';
});

const comparisonTone = computed(() => {
    if (previousPeriod.value.deltaPercentage === null) return 'neutral';
    if (previousPeriod.value.deltaAmount > 0) return 'danger';
    if (previousPeriod.value.deltaAmount < 0) return 'positive';
    return 'neutral';
});

const comparisonIcon = computed(() => {
    if (previousPeriod.value.deltaPercentage === null || previousPeriod.value.deltaAmount === 0) {
        return 'progress';
    }

    return previousPeriod.value.deltaAmount > 0 ? 'trendUp' : 'trendDown';
});

const comparisonBadgeText = computed(() => {
    const label = previousPeriod.value.label || 'periodo anterior';

    if (previousPeriod.value.deltaPercentage === null) {
        return `Sem base em ${label}`;
    }

    if (previousPeriod.value.deltaAmount === 0) {
        return `Mesmo total que ${label}`;
    }

    const percentage = Math.abs(previousPeriod.value.deltaPercentage)
        .toFixed(Number.isInteger(Math.abs(previousPeriod.value.deltaPercentage)) ? 0 : 1)
        .replace('.', ',');

    return `${percentage}% ${previousPeriod.value.deltaAmount > 0 ? 'maior' : 'menor'} que ${label}`;
});

const leadCategoryShareLabel = computed(() => {
    if (!leadCategory.value) return 'Sem composicao';
    return `${leadCategory.value.share.toFixed(0)}% do total`;
});

const leadCategoryAmountLabel = computed(() => {
    if (!leadCategory.value) {
        return 'Assim que houver despesas, a composicao aparece aqui.';
    }

    return `${formatCurrency(leadCategory.value.amount)} no periodo`;
});

const emptyStateCopy = computed(() => {
    if (searchQuery.value.trim()) {
        return {
            title: 'Nenhum resultado para esta busca',
            description: 'Tente outro termo ou limpe a busca para revisar todas as despesas do periodo.',
            button: 'Limpar busca',
        };
    }

    return {
        title: 'Nenhuma despesa neste periodo',
        description: `Cadastre uma nova despesa para iniciar a leitura de ${periodLabel.value}.`,
        button: 'Nova Despesa',
    };
});

const formSubmitLabel = computed(() => {
    if (saving.value) return 'Salvando...';
    return editingId.value ? 'Atualizar despesa' : 'Salvar despesa';
});

const exportRows = computed(() =>
    filteredExpenses.value.map((expense) => ({
        date: formatDate(expense.date),
        description: expense.description,
        category: expenseCategoryLabel(expense.category),
        paymentMethod: paymentMethodLabel(expense.payment_method),
        status: statusLabel(expense.status),
        amount: formatCurrency(expense.amount),
    })),
);

const exportedAtLabel = () =>
    new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date());

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const buildExportRowsMarkup = () =>
    exportRows.value.length
        ? exportRows.value
              .map(
                  (row) => `
                <tr>
                    <td>${escapeHtml(row.date)}</td>
                    <td><strong>${escapeHtml(row.description)}</strong></td>
                    <td>${escapeHtml(row.category)}</td>
                    <td>${escapeHtml(row.paymentMethod)}</td>
                    <td>${escapeHtml(row.status)}</td>
                    <td class="amount">${escapeHtml(row.amount)}</td>
                </tr>
            `,
              )
              .join('')
        : `
            <tr>
                <td colspan="6">
                    <strong>Nenhuma despesa encontrada</strong>
                    <div class="muted">Nao ha linhas disponiveis para os filtros aplicados na exportacao.</div>
                </td>
            </tr>
        `;

const buildExportDocument = ({ title }) => {
    const summaryCards = [
        {
            label: 'Total despesas',
            value: formatCurrency(totalAmount.value),
            detail: comparisonBadgeText.value,
        },
        {
            label: 'Pagas',
            value: formatCurrency(paidTotal.value),
            detail: paidDescription.value,
        },
        {
            label: 'Em aberto',
            value: formatCurrency(openTotal.value),
            detail: openStateDescription.value,
        },
        {
            label: 'Categoria lider',
            value: leadCategory.value ? leadCategory.value.label : 'Sem dados',
            detail: leadCategory.value ? `${leadCategory.value.share.toFixed(1).replace('.', ',')}% do total` : 'Sem composicao',
        },
    ];

    const summaryMarkup = summaryCards
        .map(
            (item) => `
                <article class="summary-card">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${escapeHtml(item.value)}</strong>
                    <small>${escapeHtml(item.detail)}</small>
                </article>
            `,
        )
        .join('');

    const legendMarkup = categoryBreakdown.value.length
        ? categoryBreakdown.value
              .map(
                  (item) => `
                    <li>
                        <span class="legend-dot" style="background:${escapeHtml(item.color)}"></span>
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.share.toFixed(1).replace('.', ','))}%</strong>
                    </li>
                `,
              )
              .join('')
        : '<li><span>Sem composicao para exportar neste periodo.</span></li>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
        :root {
            --ink: #163247;
            --muted: #6d7f97;
            --line: #d8e1ec;
            --surface: #ffffff;
            --surface-soft: #f8fafc;
            --brand: #e11d48;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: var(--ink);
            background: linear-gradient(180deg, #f8fafc 0%, #edf2f8 100%);
            padding: 28px;
        }
        .sheet {
            max-width: 1120px;
            margin: 0 auto;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(22, 50, 71, 0.08);
        }
        .hero {
            padding: 28px 32px 24px;
            background: linear-gradient(135deg, rgba(225, 29, 72, 0.08) 0%, rgba(248, 113, 113, 0.05) 100%);
            border-bottom: 1px solid var(--line);
        }
        .hero-top {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: start;
        }
        h1 {
            margin: 0 0 8px;
            font-size: 30px;
            line-height: 1.1;
        }
        p {
            margin: 0;
            color: var(--muted);
            line-height: 1.5;
        }
        .meta {
            display: grid;
            gap: 6px;
            min-width: 220px;
            padding: 16px 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: rgba(255,255,255,0.82);
        }
        .meta span {
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 700;
        }
        .meta strong {
            font-size: 18px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
            padding: 24px 32px 8px;
        }
        .summary-card {
            display: grid;
            gap: 8px;
            padding: 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: var(--surface-soft);
        }
        .summary-card span {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
            font-weight: 700;
        }
        .summary-card strong {
            font-size: 28px;
            line-height: 1.05;
        }
        .summary-card small {
            color: var(--muted);
            font-size: 13px;
        }
        .section {
            padding: 24px 32px 32px;
        }
        .section-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 280px;
            gap: 24px;
        }
        .card {
            border: 1px solid var(--line);
            border-radius: 20px;
            background: var(--surface);
            overflow: hidden;
        }
        .card h2 {
            margin: 0;
            padding: 18px 20px;
            font-size: 18px;
            border-bottom: 1px solid var(--line);
            background: #fbfdff;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 16px 18px;
            border-bottom: 1px solid #e9eff5;
            text-align: left;
            vertical-align: top;
            font-size: 14px;
        }
        th {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
            font-weight: 700;
            background: #fbfdff;
        }
        td strong { display: block; margin-bottom: 4px; }
        .muted { color: var(--muted); font-size: 12px; line-height: 1.4; }
        .amount { text-align: right; font-weight: 700; white-space: nowrap; color: var(--brand); }
        .legend {
            list-style: none;
            margin: 0;
            padding: 14px 18px 18px;
            display: grid;
            gap: 14px;
        }
        .legend li {
            display: grid;
            grid-template-columns: 12px minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            color: var(--ink);
        }
        .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 999px;
        }
        .insight {
            margin: 0;
            padding: 0 18px 20px;
            color: var(--muted);
            line-height: 1.6;
        }
        .footer-note {
            margin-top: 18px;
            color: var(--muted);
            font-size: 12px;
        }
        @media print {
            body { background: #fff; padding: 0; }
            .sheet { box-shadow: none; border-radius: 0; border: 0; max-width: none; }
        }
    </style>
</head>
<body>
    <main class="sheet">
        <section class="hero">
            <div class="hero-top">
                <div>
                    <h1>Relatorio de Despesas</h1>
                    <p>Exportacao organizada do periodo ${escapeHtml(periodLabel.value)} com indicadores, composicao e tabela detalhada.</p>
                </div>
                <aside class="meta">
                    <span>Gerado em</span>
                    <strong>${escapeHtml(exportedAtLabel())}</strong>
                    <p>${escapeHtml(exportRows.value.length)} linhas exportadas</p>
                </aside>
            </div>
        </section>

        <section class="summary-grid">
            ${summaryMarkup}
        </section>

        <section class="section">
            <div class="section-grid">
                <section class="card">
                    <h2>Lancamentos do periodo</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descricao</th>
                                <th>Categoria</th>
                                <th>Meio de pagamento</th>
                                <th>Estado</th>
                                <th style="text-align:right;">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildExportRowsMarkup()}
                        </tbody>
                    </table>
                </section>

                <aside class="card">
                    <h2>Composicao por categoria</h2>
                    <ul class="legend">${legendMarkup}</ul>
                    <p class="insight">${escapeHtml(leadCategory.value ? `${leadCategory.value.label} concentra a maior parcela das despesas do periodo.` : 'Sem dados suficientes para identificar a categoria lider.')}</p>
                </aside>
            </div>
            <p class="footer-note">Fonte: Finance Atlas | Tela de Despesas | Filtros ativos: ${escapeHtml(periodLabel.value)}</p>
        </section>
    </main>
</body>
</html>`;
};

const downloadFile = ({ content, type, filename }) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const closeExportMenu = () => {
    isExportMenuOpen.value = false;
};

const toggleExportMenu = () => {
    isExportMenuOpen.value = !isExportMenuOpen.value;
};

const exportToExcel = () => {
    const content = buildExportDocument({ title: 'Relatorio de Despesas' });
    const filename = `despesas-${filters.year}-${String(filters.month).padStart(2, '0')}.xls`;

    downloadFile({
        content,
        type: 'application/vnd.ms-excel;charset=utf-8;',
        filename,
    });

    message.value = 'Exportacao em Excel iniciada com sucesso.';
    closeExportMenu();
};

const exportToPdf = () => {
    const exportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=820');
    if (!exportWindow) {
        error.value = 'Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-up.';
        closeExportMenu();
        return;
    }

    exportWindow.document.open();
    exportWindow.document.write(buildExportDocument({ title: 'Relatorio de Despesas PDF' }));
    exportWindow.document.close();
    exportWindow.focus();

    window.setTimeout(() => {
        exportWindow.print();
    }, 250);

    message.value = 'Visualizacao para PDF aberta com sucesso.';
    closeExportMenu();
};

const clearFieldErrors = () => {
    fieldErrors.description = '';
    fieldErrors.amount = '';
    fieldErrors.date = '';
    fieldErrors.category = '';
    fieldErrors.status = '';
};

const resetForm = () => {
    Object.assign(form, createFormState());
    clearFieldErrors();
    formError.value = '';
    editingId.value = null;
};

const handleAmountInput = (event) => {
    form.amount = sanitizeCurrencyDraft(event.target.value);
};

const handleAmountFocus = () => {
    form.amount = toCurrencyDraft(form.amount);
};

const handleAmountBlur = () => {
    form.amount = formatCurrencyInput(form.amount);
};

const focusDescriptionField = async () => {
    await nextTick();
    descriptionInput.value?.focus();
};

const openCreateModal = () => {
    closeExportMenu();
    resetForm();
    isFormOpen.value = true;
    focusDescriptionField();
};

const openEditModal = (expense) => {
    closeExportMenu();
    editingId.value = expense.id;
    form.description = expense.description;
    form.amount = formatCurrencyInput(expense.amount);
    form.date = toDateInputValue(expense.date);
    form.category = expense.category;
    form.payment_method = expense.payment_method || '';
    form.status = expense.status || 'pendente';
    form.notes = expense.notes || '';
    clearFieldErrors();
    formError.value = '';
    isFormOpen.value = true;
    focusDescriptionField();
};

const closeFormModal = () => {
    if (saving.value) return;
    isFormOpen.value = false;
    resetForm();
};

const clearDeleteModal = () => {
    deleteTarget.value = null;
};

const openDeleteModal = (expense) => {
    if (deleting.value) return;
    deleteTarget.value = expense;
};

const closeDeleteModal = () => {
    if (deleting.value) return;
    clearDeleteModal();
};

const clearSearch = () => {
    searchQuery.value = '';
};

const validateForm = () => {
    formError.value = '';
    clearFieldErrors();

    if (String(form.description).trim().length < 3) {
        fieldErrors.description = 'Campo obrigatorio (min. 3 caracteres).';
    }

    if (parseCurrencyInput(form.amount) <= 0) {
        fieldErrors.amount = 'Valor deve ser maior que zero.';
    }

    if (!form.date) {
        fieldErrors.date = 'Selecione uma data valida.';
    }

    if (!String(form.category).trim()) {
        fieldErrors.category = 'Selecione uma categoria.';
    }

    if (!String(form.status).trim()) {
        fieldErrors.status = 'Selecione um estado valido.';
    }

    return !Object.values(fieldErrors).some(Boolean);
};

const destroyCategoryChart = () => {
    if (!categoryChart) return;

    categoryChart.destroy();
    categoryChart = null;
};

const clearMessageTimeout = () => {
    if (!messageTimeoutId) return;

    window.clearTimeout(messageTimeoutId);
    messageTimeoutId = null;
};

const renderCategoryChart = () => {
    if (!categoryChartCanvas.value) return;

    destroyCategoryChart();

    categoryChart = new Chart(categoryChartCanvas.value, {
        type: 'doughnut',
        data: {
            labels: hasCategoryData.value ? categoryBreakdown.value.map((item) => item.label) : ['Sem despesas'],
            datasets: [
                {
                    data: hasCategoryData.value ? categoryBreakdown.value.map((item) => item.amount) : [1],
                    backgroundColor: hasCategoryData.value
                        ? categoryBreakdown.value.map((item) => item.color)
                        : ['#e5e7eb'],
                    borderWidth: 0,
                    hoverOffset: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%',
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (!hasCategoryData.value) {
                                return 'Sem despesas no periodo selecionado.';
                            }

                            const item = categoryBreakdown.value[context.dataIndex];
                            return `${item.label}: ${item.share.toFixed(1).replace('.', ',')}%`;
                        },
                    },
                },
            },
        },
    });
};

const loadExpenses = async ({ resetPage = false } = {}) => {
    loading.value = true;
    error.value = '';

    if (resetPage) {
        currentPage.value = 1;
    }

    try {
        const { data } = await api.get('/expenses', {
            params: {
                month: filters.month,
                year: filters.year,
            },
        });

        expenses.value = Array.isArray(data.data) ? data.data : [];
        totalAmount.value = Number(data.meta?.total_amount || 0);
        serverBreakdown.value = Array.isArray(data.meta?.breakdown_by_category) ? data.meta.breakdown_by_category : [];
        previousPeriod.value = normalizePreviousPeriod(data.meta?.previous_period);
    } catch {
        expenses.value = [];
        totalAmount.value = 0;
        serverBreakdown.value = [];
        previousPeriod.value = createPreviousPeriodState();
        error.value = 'Falha ao carregar despesas.';
    } finally {
        loading.value = false;
        await nextTick();
        renderCategoryChart();
    }
};

const saveExpense = async () => {
    message.value = '';
    error.value = '';

    if (!validateForm()) return;

    const isEditing = Boolean(editingId.value);
    const targetId = editingId.value;
    const payload = {
        description: String(form.description).trim(),
        amount: parseCurrencyInput(form.amount),
        date: form.date,
        category: form.category,
        payment_method: String(form.payment_method || '').trim() || null,
        status: form.status,
        notes: String(form.notes || '').trim() || null,
    };

    saving.value = true;

    try {
        if (isEditing) {
            await api.put(`/expenses/${targetId}`, payload);
        } else {
            await api.post('/expenses', payload);
        }

        await loadExpenses();
        message.value = isEditing ? 'Despesa atualizada com sucesso.' : 'Despesa cadastrada com sucesso.';
        isFormOpen.value = false;
        resetForm();
    } catch (requestError) {
        formError.value = requestError?.response?.data?.message || 'Nao foi possivel salvar a despesa.';
    } finally {
        saving.value = false;
    }
};

const confirmDeleteExpense = async () => {
    const expense = deleteTarget.value;
    if (!expense || deleting.value) return;

    message.value = '';
    error.value = '';
    deleting.value = true;

    try {
        await api.delete(`/expenses/${expense.id}`);
        clearDeleteModal();
        await loadExpenses();
        message.value = 'Despesa excluida com sucesso.';
    } catch {
        error.value = 'Nao foi possivel excluir a despesa.';
    } finally {
        deleting.value = false;
    }
};

const goToPage = (page) => {
    currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
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
        return;
    }

    if (event.key === 'Escape' && isDeleteModalOpen.value && !deleting.value) {
        closeDeleteModal();
        return;
    }

    if (event.key === 'Escape' && isFormOpen.value && !saving.value) {
        closeFormModal();
        return;
    }

    if ((event.key === 'Enter' || event.key === 'NumpadEnter') && event.ctrlKey && isFormOpen.value && !saving.value) {
        event.preventDefault();
        saveExpense();
    }
};

watch(isAnyModalOpen, (value) => {
    document.body.style.overflow = value ? 'hidden' : '';
});

watch(message, (value) => {
    clearMessageTimeout();

    if (!value) return;

    messageTimeoutId = window.setTimeout(() => {
        message.value = '';
        messageTimeoutId = null;
    }, 4000);
});

watch(
    () => form.description,
    () => {
        fieldErrors.description = '';
        formError.value = '';
    },
);

watch(
    () => form.amount,
    () => {
        fieldErrors.amount = '';
        formError.value = '';
    },
);

watch(
    () => form.date,
    () => {
        fieldErrors.date = '';
        formError.value = '';
    },
);

watch(
    () => form.category,
    () => {
        fieldErrors.category = '';
        formError.value = '';
    },
);

watch(
    () => form.status,
    () => {
        fieldErrors.status = '';
        formError.value = '';
    },
);

watch([() => filters.month, () => filters.year], () => {
    loadExpenses({ resetPage: true });
});

watch(searchQuery, () => {
    currentPage.value = 1;
});

watch(totalPages, (value) => {
    if (currentPage.value > value) {
        currentPage.value = value;
    }
});

onMounted(() => {
    window.addEventListener('keydown', handleWindowKeydown);
    document.addEventListener('click', handleDocumentClick);
    loadExpenses({ resetPage: true });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleWindowKeydown);
    document.removeEventListener('click', handleDocumentClick);
    document.body.style.overflow = '';
    clearMessageTimeout();
    destroyCategoryChart();
});
</script>

<template>
    <section class="page expenses-page">
        <header class="page-header expenses-header">
            <div class="expenses-header-copy">
                <h2>Controle de Despesas</h2>
                <p>Gerencie suas saidas e mantenha o orcamento sob controle.</p>
            </div>

            <div class="expenses-header-actions">
                <div ref="exportMenuRef" class="export-menu">
                    <button
                        class="btn-ghost incomes-export-trigger expenses-export-trigger"
                        type="button"
                        aria-haspopup="menu"
                        :aria-expanded="isExportMenuOpen"
                        @click.stop="toggleExportMenu"
                    >
                        <AppIcon name="download" :size="17" />
                        <span>Exportar</span>
                        <AppIcon name="chevronDown" :size="16" />
                    </button>

                    <div
                        v-if="isExportMenuOpen"
                        class="export-menu-panel expense-export-menu-panel"
                        role="menu"
                        aria-label="Opcoes de exportacao"
                    >
                        <button class="export-menu-item" type="button" role="menuitem" @click="exportToPdf">
                            <AppIcon name="fileText" :size="16" />
                            <span>
                                <strong>Exportar PDF</strong>
                                <small>Layout pronto para impressao e compartilhamento.</small>
                            </span>
                        </button>

                        <button class="export-menu-item" type="button" role="menuitem" @click="exportToExcel">
                            <AppIcon name="fileSpreadsheet" :size="16" />
                            <span>
                                <strong>Exportar Excel</strong>
                                <small>Tabela organizada com resumo e filtros ativos.</small>
                            </span>
                        </button>
                    </div>
                </div>

                <button class="btn-primary expenses-header-action" type="button" @click="openCreateModal">
                    <AppIcon name="plus" :size="17" />
                    <span>Nova Despesa</span>
                </button>
            </div>
        </header>

        <section class="cards-grid expenses-summary-grid">
            <template v-if="loading">
                <article v-for="index in 4" :key="`expense-skeleton-${index}`" class="metric-card expense-summary-card skeleton-card">
                    <span class="skeleton-line skeleton-line-sm" />
                    <span class="skeleton-line skeleton-line-lg" />
                    <span class="skeleton-line skeleton-line-md" />
                </article>
            </template>

            <template v-else>
                <article class="metric-card expense-summary-card tone-danger">
                    <div class="expense-summary-head">
                        <h3>Total despesas</h3>
                    </div>

                    <strong class="finance-amount expense-summary-value expense-summary-value-danger">
                        {{ formatCurrency(totalAmount) }}
                    </strong>

                    <p class="expense-trend-pill" :class="`tone-${comparisonTone}`">
                        <AppIcon :name="comparisonIcon" :size="14" />
                        <span>{{ comparisonBadgeText }}</span>
                    </p>
                </article>

                <article class="metric-card expense-summary-card tone-neutral">
                    <div class="expense-summary-head">
                        <h3>Pagas</h3>
                    </div>

                    <strong class="finance-amount expense-summary-value">{{ formatCurrency(paidTotal) }}</strong>
                    <p class="metric-description expense-summary-description">{{ paidDescription }}</p>
                </article>

                <article class="metric-card expense-summary-card tone-warning">
                    <div class="expense-summary-head">
                        <h3>Pendente</h3>
                    </div>

                    <strong class="finance-amount expense-summary-value expense-summary-value-warning">
                        {{ formatCurrency(openTotal) }}
                    </strong>
                    <p class="metric-description expense-summary-description">{{ openStateDescription }}</p>
                </article>

                <article class="metric-card expense-summary-card expense-lead-card" :class="{ 'is-empty': !leadCategory }">
                    <div class="expense-lead-visual">
                        <canvas ref="categoryChartCanvas" />
                    </div>

                    <div class="expense-lead-copy">
                        <h3>{{ leadCategory ? leadCategory.label.toUpperCase() : 'SEM DADOS' }}</h3>
                        <strong>{{ leadCategoryShareLabel }}</strong>
                        <p class="metric-description">{{ leadCategoryAmountLabel }}</p>
                    </div>
                </article>
            </template>
        </section>

        <section class="panel expenses-workspace">
            <div v-if="loading" class="incomes-toolbar expenses-toolbar">
                <span class="skeleton-box skeleton-input" />
                <div class="expenses-toolbar-filters">
                    <span class="skeleton-box skeleton-filter" />
                    <span class="skeleton-box skeleton-filter" />
                </div>
            </div>

            <div v-else class="incomes-toolbar expenses-toolbar">
                <label class="incomes-toolbar-search expenses-toolbar-search">
                    <span>Buscar</span>
                    <div class="search-field income-search-field expense-search-field">
                        <AppIcon name="search" :size="16" />
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Buscar despesa, categoria ou conta..."
                            aria-label="Buscar despesa, categoria ou conta"
                        />
                    </div>
                </label>

                <div class="expenses-toolbar-filters">
                    <label>
                        <span>Mes</span>
                        <select v-model.number="filters.month">
                            <option v-for="month in monthOptions" :key="month.value" :value="month.value">
                                {{ month.label }}
                            </option>
                        </select>
                    </label>

                    <label>
                        <span>Ano</span>
                        <select v-model.number="filters.year">
                            <option v-for="year in yearOptions" :key="year" :value="year">
                                {{ year }}
                            </option>
                        </select>
                    </label>
                </div>
            </div>

            <p v-if="message" class="success-text income-feedback">{{ message }}</p>
            <p v-if="error" class="error-text income-feedback">{{ error }}</p>

            <div v-if="loading" class="income-table-skeleton">
                <span class="skeleton-line skeleton-line-table-head" />
                <span v-for="index in 5" :key="`expense-row-skeleton-${index}`" class="skeleton-row" />
            </div>

            <template v-else-if="paginatedExpenses.length">
                <div class="table-wrap income-table-wrap expense-table-wrap">
                    <table class="income-table expense-table">
                        <colgroup>
                            <col class="expense-col-date" />
                            <col class="expense-col-description" />
                            <col class="expense-col-payment" />
                            <col class="expense-col-status" />
                            <col class="expense-col-value" />
                            <col class="expense-col-actions" />
                        </colgroup>

                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descricao / Categoria</th>
                                <th>Meio de Pagamento</th>
                                <th>Status</th>
                                <th class="align-right">Valor</th>
                                <th class="align-center">Acoes</th>
                            </tr>
                        </thead>

                        <tbody>
                            <tr v-for="expense in paginatedExpenses" :key="expense.id">
                                <td class="income-date-cell expense-date-cell">{{ formatDate(expense.date) }}</td>

                                <td class="income-description-cell expense-description-cell">
                                    <div class="income-description-stack expense-description-stack">
                                        <strong>{{ expense.description }}</strong>
                                        <span class="expense-category-chip">{{ expenseCategoryLabel(expense.category) }}</span>
                                    </div>
                                </td>

                                <td>
                                    <span class="expense-payment-indicator">
                                        <AppIcon name="creditCard" :size="16" />
                                        <span>{{ paymentMethodLabel(expense.payment_method) }}</span>
                                    </span>
                                </td>

                                <td>
                                    <span class="expense-status-pill" :class="`tone-${statusTone(expense.status)}`">
                                        {{ statusLabel(expense.status) }}
                                    </span>
                                </td>

                                <td class="money-cell expense-money-cell">
                                    <div class="money-cell-inner">
                                        <strong class="finance-amount">{{ formatCurrency(expense.amount) }}</strong>
                                    </div>
                                </td>

                                <td class="actions-cell">
                                    <div class="actions-cell-inner row-actions icon-actions">
                                        <button
                                            type="button"
                                            class="btn-icon btn-edit"
                                            title="Editar despesa"
                                            aria-label="Editar despesa"
                                            @click="openEditModal(expense)"
                                        >
                                            <AppIcon name="edit" :size="15" />
                                        </button>

                                        <button
                                            type="button"
                                            class="btn-icon btn-delete"
                                            title="Excluir despesa"
                                            aria-label="Excluir despesa"
                                            @click="openDeleteModal(expense)"
                                        >
                                            <AppIcon name="delete" :size="15" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="totalPages > 1" class="income-table-footer">
                    <div class="income-table-footer-line" />
                    <nav class="table-pagination" aria-label="Paginacao das despesas">
                        <button
                            type="button"
                            class="pagination-btn"
                            :disabled="currentPage === 1"
                            @click="goToPage(currentPage - 1)"
                        >
                            <AppIcon name="chevronLeft" :size="16" />
                        </button>

                        <button
                            v-for="page in paginationPages"
                            :key="`expense-page-${page}`"
                            type="button"
                            class="pagination-page"
                            :class="{ active: page === currentPage }"
                            @click="goToPage(page)"
                        >
                            {{ page }}
                        </button>

                        <button
                            type="button"
                            class="pagination-btn"
                            :disabled="currentPage === totalPages"
                            @click="goToPage(currentPage + 1)"
                        >
                            <AppIcon name="chevronRight" :size="16" />
                        </button>
                    </nav>
                </div>
            </template>

            <div v-else class="expense-empty-state-panel">
                <div class="income-empty-illustration expense-empty-illustration">
                    <AppIcon :name="searchQuery.trim() ? 'search' : 'expenses'" :size="28" />
                </div>

                <h3>{{ emptyStateCopy.title }}</h3>
                <p>{{ emptyStateCopy.description }}</p>

                <button v-if="searchQuery.trim()" class="btn-ghost" type="button" @click="clearSearch">
                    {{ emptyStateCopy.button }}
                </button>

                <button v-else class="btn-primary expenses-header-action expense-empty-action" type="button" @click="openCreateModal">
                    <AppIcon name="plus" :size="16" />
                    <span>{{ emptyStateCopy.button }}</span>
                </button>
            </div>
        </section>

        <Teleport to="body">
            <Transition name="modal-fade">
                <div v-if="isFormOpen" class="modal-backdrop" @click.self="closeFormModal">
                    <section
                        class="modal-panel income-form-modal expense-form-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="expense-form-title"
                    >
                        <div class="income-form-modal-header expense-form-modal-header">
                            <div>
                                <h3 id="expense-form-title">
                                    {{ editingId ? 'Editar despesa' : 'Cadastrar nova despesa' }}
                                </h3>
                                <p>Organize categoria, meio de pagamento e status para manter sua leitura do mes mais clara.</p>
                            </div>

                            <button
                                type="button"
                                class="btn-icon btn-icon-ghost"
                                aria-label="Fechar formulario"
                                @click="closeFormModal"
                            >
                                <AppIcon name="close" :size="18" />
                            </button>
                        </div>

                        <form class="income-form-layout expense-form-layout" @submit.prevent="saveExpense">
                            <label class="modal-field">
                                <span class="modal-field-label">
                                    Descricao
                                    <span class="required-mark">*</span>
                                </span>
                                <input
                                    ref="descriptionInput"
                                    v-model="form.description"
                                    class="modal-input-shell"
                                    :class="{ 'has-error': fieldErrors.description }"
                                    type="text"
                                    placeholder="Ex.: Internet e energia 04/2026"
                                    autocomplete="off"
                                    required
                                />
                                <span v-if="fieldErrors.description" class="modal-field-error">
                                    <AppIcon name="alert" :size="14" />
                                    <span>{{ fieldErrors.description }}</span>
                                </span>
                            </label>

                            <div class="expense-form-pair">
                                <label class="modal-field">
                                    <span class="modal-field-label">
                                        Valor
                                        <span class="required-mark">*</span>
                                    </span>
                                    <div class="modal-input-shell modal-currency-field expense-currency-field" :class="{ 'has-error': fieldErrors.amount }">
                                        <span class="modal-currency-prefix">R$</span>
                                        <input
                                            v-model="form.amount"
                                            type="text"
                                            inputmode="numeric"
                                            placeholder="0,00"
                                            autocomplete="off"
                                            required
                                            @input="handleAmountInput"
                                            @focus="handleAmountFocus"
                                            @blur="handleAmountBlur"
                                        />
                                    </div>
                                    <span v-if="fieldErrors.amount" class="modal-field-error">
                                        <AppIcon name="alert" :size="14" />
                                        <span>{{ fieldErrors.amount }}</span>
                                    </span>
                                </label>

                                <label class="modal-field">
                                    <span class="modal-field-label">
                                        Data
                                        <span class="required-mark">*</span>
                                    </span>
                                    <input
                                        v-model="form.date"
                                        class="modal-input-shell"
                                        :class="{ 'has-error': fieldErrors.date }"
                                        type="date"
                                        required
                                    />
                                    <span v-if="fieldErrors.date" class="modal-field-error">
                                        <AppIcon name="alert" :size="14" />
                                        <span>{{ fieldErrors.date }}</span>
                                    </span>
                                </label>
                            </div>

                            <div class="expense-form-pair">
                                <label class="modal-field">
                                    <span class="modal-field-label">
                                        Categoria
                                        <span class="required-mark">*</span>
                                    </span>
                                    <select
                                        v-model="form.category"
                                        class="modal-input-shell"
                                        :class="{ 'has-error': fieldErrors.category }"
                                        required
                                    >
                                        <option value="" disabled>Selecione uma categoria</option>
                                        <option
                                            v-for="category in Object.keys(categoryPalette)"
                                            :key="category"
                                            :value="category"
                                        >
                                            {{ expenseCategoryLabel(category) }}
                                        </option>
                                    </select>
                                    <span v-if="fieldErrors.category" class="modal-field-error">
                                        <AppIcon name="alert" :size="14" />
                                        <span>{{ fieldErrors.category }}</span>
                                    </span>
                                </label>

                                <label class="modal-field">
                                    <span class="modal-field-label">Meio de pagamento</span>
                                    <input
                                        v-model="form.payment_method"
                                        list="expense-payment-methods"
                                        class="modal-input-shell"
                                        type="text"
                                        placeholder="Ex.: Nubank, Pix, Debito"
                                        autocomplete="off"
                                    />
                                    <datalist id="expense-payment-methods">
                                        <option
                                            v-for="method in paymentMethodSuggestions"
                                            :key="`payment-method-${method}`"
                                            :value="method"
                                        />
                                    </datalist>
                                </label>
                            </div>

                            <label class="modal-field">
                                <span class="modal-field-label">
                                    Status
                                    <span class="required-mark">*</span>
                                </span>
                                <select
                                    v-model="form.status"
                                    class="modal-input-shell"
                                    :class="{ 'has-error': fieldErrors.status }"
                                    required
                                >
                                    <option v-for="status in expenseStatuses" :key="status.value" :value="status.value">
                                        {{ status.label }}
                                    </option>
                                </select>
                                <span v-if="fieldErrors.status" class="modal-field-error">
                                    <AppIcon name="alert" :size="14" />
                                    <span>{{ fieldErrors.status }}</span>
                                </span>
                            </label>

                            <label class="modal-field">
                                <span class="modal-field-label">Observacao</span>
                                <textarea
                                    v-model="form.notes"
                                    class="modal-input-shell modal-notes-field"
                                    rows="4"
                                    placeholder="Adicione detalhes opcionais..."
                                />
                            </label>

                            <p v-if="formError" class="error-text modal-form-error">{{ formError }}</p>

                            <div class="income-form-actions">
                                <button class="btn-primary expenses-header-action expense-submit-btn" type="submit" :disabled="saving">
                                    <AppIcon :name="editingId ? 'edit' : 'plus'" :size="15" />
                                    <span>{{ formSubmitLabel }}</span>
                                </button>

                                <button class="btn-cancel-link" type="button" :disabled="saving" @click="closeFormModal">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            </Transition>
        </Teleport>

        <ConfirmDeleteModal
            :open="isDeleteModalOpen"
            :item-name="deleteTarget?.description || ''"
            entity-label="despesa"
            :loading="deleting"
            @close="closeDeleteModal"
            @confirm="confirmDeleteExpense"
        />
    </section>
</template>
