<script setup>
import { Chart, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '@/services/api';
import { loadMonthlyFinancialReport } from '@/services/reports/loadMonthlyFinancialReport';
import AppIcon from '@/components/AppIcon.vue';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import {
    humanizeLabel,
    incomeStatusLabel,
    incomeStatusTone,
    incomeTypeLabel,
    monthOptions,
} from '@/utils/labels';

Chart.register(...registerables);

const ROWS_PER_PAGE = 5;

const incomeTypes = [
    { value: 'salario', label: 'Salário', tone: 'positive', color: '#159a8c' },
    { value: 'renda_extra', label: 'Renda extra', tone: 'warning', color: '#ff922b' },
    { value: 'rendimento_investimento', label: 'Investimento', tone: 'info', color: '#3b82f6' },
    { value: 'outros', label: 'Outros', tone: 'neutral', color: '#94a3b8' },
];

const incomeStatuses = [
    { value: 'recebido', label: 'Recebido' },
    { value: 'pendente', label: 'Pendente' },
];

const baseCategoryOptions = [
    { value: 'Trabalho', type: 'salario' },
    { value: 'Projetos', type: 'renda_extra' },
    { value: 'Investimento', type: 'rendimento_investimento' },
    { value: 'Vendas', type: 'outros' },
    { value: 'Outros', type: 'outros' },
];

const featuredCategoryLabels = ['Trabalho', 'Projetos', 'Investimento', 'Vendas'];

const sortOptions = [
    { value: 'date_desc', label: 'Mais recentes' },
    { value: 'date_asc', label: 'Mais antigas' },
    { value: 'amount_desc', label: 'Maior valor' },
    { value: 'amount_asc', label: 'Menor valor' },
    { value: 'description_asc', label: 'Descrição' },
];

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

const formatSignedPercentage = (value) => {
    const numericValue = Number(value || 0);
    const absoluteValue = Math.abs(numericValue);
    const formatted = Number.isInteger(absoluteValue)
        ? absoluteValue.toFixed(0)
        : absoluteValue.toFixed(1).replace('.', ',');

    if (numericValue === 0) {
        return '0%';
    }

    return `${numericValue > 0 ? '+ ' : '- '}${formatted}%`;
};

const formatCompactTotal = (value) => {
    const numericValue = Number(value || 0);
    const absoluteValue = Math.abs(numericValue);

    if (!absoluteValue) return '0';

    if (absoluteValue >= 1000) {
        const scaled = absoluteValue / 1000;
        const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
        return `${numericValue < 0 ? '-' : ''}${String(rounded).replace('.', ',')}k`;
    }

    return new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0,
    }).format(numericValue);
};

const inferIncomeType = (category, fallback = 'outros') => {
    const normalized = normalizeText(category);
    if (!normalized) return fallback;

    const baseMatch = baseCategoryOptions.find((option) => normalizeText(option.value) === normalized);
    if (baseMatch) return baseMatch.type;

    const existingIncomeMatch = incomes.value.find(
        (income) => normalizeText(income.category) === normalized && income.type,
    );
    if (existingIncomeMatch) return existingIncomeMatch.type;

    if (normalized.includes('sal')) return 'salario';
    if (normalized.includes('invest') || normalized.includes('rend')) return 'rendimento_investimento';
    if (normalized.includes('projet') || normalized.includes('freela') || normalized.includes('alugu')) {
        return 'renda_extra';
    }
    if (normalized.includes('vend') || normalized.includes('outro')) return 'outros';

    return fallback;
};

const createFormState = () => ({
    description: '',
    amount: '',
    date: getTodayInputValue(),
    category: '',
    status: 'recebido',
    type: 'outros',
    notes: '',
});

const createPreviousPeriodState = () => ({
    month: null,
    year: null,
    label: 'período anterior',
    totalAmount: 0,
    deltaAmount: 0,
    deltaPercentage: null,
});

const normalizePreviousPeriod = (value) => ({
    month: Number(value?.month || 0) || null,
    year: Number(value?.year || 0) || null,
    label: value?.label ? String(value.label) : 'período anterior',
    totalAmount: Number(value?.total_amount || 0),
    deltaAmount: Number(value?.delta_amount || 0),
    deltaPercentage:
        value?.delta_percentage === null || value?.delta_percentage === undefined
            ? null
            : Number(value.delta_percentage),
});

const form = reactive(createFormState());
const filters = reactive({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
});

const incomes = ref([]);
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
const sortBy = ref('date_desc');
const currentPage = ref(1);
const descriptionInput = ref(null);
const typeChartCanvas = ref(null);
const exportMenuRef = ref(null);
const serverBreakdown = ref([]);
const previousPeriod = ref(createPreviousPeriodState());
const isExportMenuOpen = ref(false);
const isExportingExcel = ref(false);
const isExportingPdf = ref(false);
const fieldErrors = reactive({
    description: '',
    amount: '',
    date: '',
    category: '',
    status: '',
});

let typeChart = null;
let lastLoadRequestId = 0;
let messageTimeoutId = null;

const totalCount = computed(() => incomes.value.length);
const isDeleteModalOpen = computed(() => Boolean(deleteTarget.value));
const isAnyModalOpen = computed(() => isFormOpen.value || isDeleteModalOpen.value);

const periodLabel = computed(() => {
    const month = monthOptions.find((item) => item.value === Number(filters.month));
    return `${month?.label || 'mês'} de ${filters.year}`;
});

const yearOptions = computed(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([filters.year]);

    for (let year = currentYear + 1; year >= currentYear - 4; year -= 1) {
        years.add(year);
    }

    return [...years].sort((leftYear, rightYear) => rightYear - leftYear);
});

const categoryOptions = computed(() => {
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

    baseCategoryOptions.forEach((option) => pushOption(option.value));
    incomes.value.forEach((income) => pushOption(income.category));

    return options;
});

const categoryBreakdown = computed(() => {
    const totals = new Map();

    incomes.value.forEach((income) => {
        const rawLabel = String(income.category || '').trim();
        if (!rawLabel) return;

        const key = normalizeText(rawLabel);
        const currentItem = totals.get(key) || {
            key,
            label: humanizeLabel(rawLabel),
            amount: 0,
            count: 0,
        };

        currentItem.amount += Number(income.amount || 0);
        currentItem.count += 1;
        totals.set(key, currentItem);
    });

    return [...totals.values()].sort((leftCategory, rightCategory) => {
        if (Number(rightCategory.amount) !== Number(leftCategory.amount)) {
            return Number(rightCategory.amount) - Number(leftCategory.amount);
        }

        return leftCategory.label.localeCompare(rightCategory.label);
    });
});

const uniqueCategoriesCount = computed(() => categoryBreakdown.value.length);
const topCategoriesText = computed(() => {
    const labels = categoryBreakdown.value.slice(0, 3).map((item) => item.label);
    return labels.length ? labels.join(', ') : 'Sem categorias ativas';
});

const featuredCategoriesText = computed(() => featuredCategoryLabels.join(', '));

const filteredIncomes = computed(() => {
    let rows = [...incomes.value];

    if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase();
        rows = rows.filter((income) =>
            [income.description, income.category, income.notes]
                .map((value) => String(value || '').toLowerCase())
                .some((value) => value.includes(query)),
        );
    }

    rows.sort((leftIncome, rightIncome) => {
        if (sortBy.value === 'amount_desc') return Number(rightIncome.amount) - Number(leftIncome.amount);
        if (sortBy.value === 'amount_asc') return Number(leftIncome.amount) - Number(rightIncome.amount);
        if (sortBy.value === 'description_asc') {
            return String(leftIncome.description).localeCompare(String(rightIncome.description));
        }
        if (sortBy.value === 'date_asc') return new Date(leftIncome.date) - new Date(rightIncome.date);
        return new Date(rightIncome.date) - new Date(leftIncome.date);
    });

    return rows;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredIncomes.value.length / ROWS_PER_PAGE)));
const paginatedIncomes = computed(() => {
    const startIndex = (currentPage.value - 1) * ROWS_PER_PAGE;
    return filteredIncomes.value.slice(startIndex, startIndex + ROWS_PER_PAGE);
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

const typeBreakdown = computed(() => {
    const fallbackRows = incomeTypes
        .map((type) => {
            const relatedIncomes = incomes.value.filter((income) => income.type === type.value);
            const amount = relatedIncomes.reduce((sum, income) => sum + Number(income.amount || 0), 0);

            return {
                ...type,
                amount,
                count: relatedIncomes.length,
            };
        })
        .filter((item) => item.amount > 0);

    const rows = serverBreakdown.value.length
        ? serverBreakdown.value
              .map((item) => {
                  const typeConfig = incomeTypes.find((type) => type.value === item.type);
                  if (!typeConfig) return null;

                  return {
                      ...typeConfig,
                      amount: Number(item.total_amount || 0),
                      count: Number(item.total_count || 0),
                  };
              })
              .filter(Boolean)
        : fallbackRows;

    const total = totalAmount.value || rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return rows
        .map((item) => ({
            ...item,
            share: total > 0 ? (Number(item.amount || 0) / total) * 100 : 0,
        }))
        .sort((leftType, rightType) => Number(rightType.amount) - Number(leftType.amount));
});

const hasTypeData = computed(() => typeBreakdown.value.length > 0);
const leadType = computed(() => typeBreakdown.value[0] || null);

const comparisonTone = computed(() => {
    if (previousPeriod.value.deltaPercentage === null) return 'info';
    if (previousPeriod.value.deltaAmount > 0) return 'info';
    if (previousPeriod.value.deltaAmount < 0) return 'danger';
    return 'neutral';
});

const comparisonValue = computed(() => {
    if (previousPeriod.value.deltaPercentage === null) {
        return '--';
    }

    return formatSignedPercentage(previousPeriod.value.deltaPercentage);
});

const comparisonDescription = computed(() => {
    const label = previousPeriod.value.label || 'período anterior';
    const deltaAmount = Number(previousPeriod.value.deltaAmount || 0);

    if (previousPeriod.value.deltaPercentage === null) {
        if (deltaAmount === 0) {
            return `Sem base comparativa em ${label}`;
        }

        return `${formatCurrency(Math.abs(deltaAmount))} em relação a ${label}`;
    }

    if (deltaAmount === 0) {
        return `Mesmo total de ${label}`;
    }

    return deltaAmount > 0
        ? `${formatCurrency(Math.abs(deltaAmount))} a mais que ${label}`
        : `${formatCurrency(Math.abs(deltaAmount))} a menos que ${label}`;
});

const compositionInsight = computed(() => {
    if (!leadType.value) {
        return 'Assim que houver receitas neste período, a composição aparece aqui com o peso de cada origem.';
    }

    if (leadType.value.value === 'salario') {
        return 'A maior parte da receita vem de fonte fixa e recorrente.';
    }

    if (leadType.value.value === 'renda_extra') {
        return 'A maior parte da receita depende de entradas variáveis neste período.';
    }

    if (leadType.value.value === 'rendimento_investimento') {
        return 'Os rendimentos lideram o período, indicando tração da carteira.';
    }

    return 'Vale revisar se essa origem principal é recorrente ou apenas pontual neste mês.';
});

const emptyStateCopy = computed(() => {
    if (searchQuery.value.trim()) {
        return {
            title: 'Nenhum resultado para esta busca',
            description: 'Tente outro termo ou limpe a busca para voltar a visualizar todas as receitas do período.',
            button: 'Limpar busca',
        };
    }

    return {
        title: 'Nenhuma receita neste período',
        description: `Registre uma nova receita para iniciar a leitura de ${periodLabel.value}.`,
        button: 'Nova Receita',
    };
});

const formSubmitLabel = computed(() => {
    if (saving.value) return 'Salvando...';
    return editingId.value ? 'Atualizar receita' : 'Salvar receita';
});

const chartCenterValue = computed(() => formatCompactTotal(totalAmount.value));

const kpiCards = computed(() => [
    {
        id: 'income-total',
        icon: 'wallet',
        title: 'Total no período',
        tone: 'positive',
        value: formatCurrency(totalAmount.value),
        description: totalCount.value
            ? `${totalCount.value} ${totalCount.value === 1 ? 'lançamento no período' : 'lançamentos no período'}`
            : 'Nenhum lançamento no período',
        isMoney: true,
    },
    {
        id: 'income-vs-previous',
        icon: 'trendUp',
        title: 'Vs. mês anterior',
        tone: comparisonTone.value,
        value: comparisonValue.value,
        description: comparisonDescription.value,
        isMoney: false,
    },
    {
        id: 'income-lead-type',
        icon: 'award',
        title: 'Origem líder',
        tone: leadType.value?.tone || 'neutral',
        value: leadType.value ? incomeTypeLabel(leadType.value.value) : 'Sem dados',
        description: leadType.value
            ? `${formatCurrency(leadType.value.amount)} - ${leadType.value.share.toFixed(1).replace('.', ',')}% do total`
            : 'Sem composição suficiente no período',
        isMoney: false,
    },
    {
        id: 'income-categories',
        icon: 'pieChart',
        title: 'Categorias ativas',
        tone: uniqueCategoriesCount.value > 0 ? 'warning' : 'neutral',
        value: String(uniqueCategoriesCount.value),
        description: topCategoriesText.value,
        isMoney: false,
    },
]);

const incomeTypeTone = (typeValue) => incomeTypes.find((type) => type.value === typeValue)?.tone || 'neutral';

const exportRows = computed(() =>
    filteredIncomes.value.map((income) => ({
        date: formatDate(income.date),
        description: income.description,
        notes: income.notes || humanizeLabel(income.category),
        category: humanizeLabel(income.category),
        status: incomeStatusLabel(income.status),
        type: incomeTypeLabel(income.type),
        amount: formatCurrency(income.amount),
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
                    <td>
                        <strong>${escapeHtml(row.description)}</strong>
                        <div class="muted">${escapeHtml(row.notes)}</div>
                    </td>
                    <td>${escapeHtml(row.category)}</td>
                    <td>${escapeHtml(row.type)}</td>
                    <td>${escapeHtml(row.status)}</td>
                    <td class="amount">${escapeHtml(row.amount)}</td>
                </tr>
            `,
              )
              .join('')
        : `
            <tr>
                <td colspan="6">
                    <strong>Nenhuma receita encontrada</strong>
                    <div class="muted">não há linhas disponíveis para os filtros aplicados na Exportação.</div>
                </td>
            </tr>
        `;

const buildExportDocument = ({ title }) => {
    const summaryCards = [
        { label: 'Total no período', value: formatCurrency(totalAmount.value), detail: `${totalCount.value} lançamentos` },
        { label: 'Comparativo', value: comparisonValue.value, detail: comparisonDescription.value },
        {
            label: 'Origem líder',
            value: leadType.value ? incomeTypeLabel(leadType.value.value) : 'Sem dados',
            detail: leadType.value ? `${leadType.value.share.toFixed(1).replace('.', ',')}% do total` : 'Sem composição',
        },
        { label: 'Categorias ativas', value: String(uniqueCategoriesCount.value), detail: topCategoriesText.value },
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

    const legendMarkup = typeBreakdown.value.length
        ? typeBreakdown.value
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
        : '<li><span>Sem composição para exportar neste período.</span></li>';

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
            --surface-soft: #f4f7fb;
            --brand: #159a8c;
            --accent: #2f6fed;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: var(--ink);
            background: linear-gradient(180deg, #f8fafc 0%, #eef4f8 100%);
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
            background: linear-gradient(135deg, rgba(21, 154, 140, 0.08) 0%, rgba(47, 111, 237, 0.04) 100%);
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
                    <h1>relatório de Receitas</h1>
                    <p>Exportação organizada do período ${escapeHtml(periodLabel.value)} com indicadores, composição e tabela detalhada.</p>
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
                    <h2>Lançamentos do período</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descrição</th>
                                <th>Categoria</th>
                                <th>Tipo</th>
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
                    <h2>Composição das receitas</h2>
                    <ul class="legend">${legendMarkup}</ul>
                    <p class="insight">${escapeHtml(compositionInsight.value)}</p>
                </aside>
            </div>
            <p class="footer-note">Fonte: Finance Atlas | Tela de Receitas | Filtros ativos: ${escapeHtml(periodLabel.value)}</p>
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

const exportToExcel = async () => {
    if (isExportingExcel.value) return;

    const month = Number(filters.month);
    const year = Number(filters.year);

    message.value = '';
    error.value = '';
    closeExportMenu();
    isExportingExcel.value = true;

    try {
        const { generateMonthlyFinancialExcel } = await import('@/services/reports/generateMonthlyFinancialExcel');
        const report = await loadMonthlyFinancialReport({
            month,
            year,
            generatedAt: new Date(),
        });

        await generateMonthlyFinancialExcel(report);
        message.value = 'Exportação em Excel iniciada com sucesso.';
    } catch {
        error.value = 'não foi possivel exportar o Excel deste período.';
    } finally {
        isExportingExcel.value = false;
    }
};

const exportToPdf = async () => {
    if (isExportingPdf.value) return;

    const month = Number(filters.month);
    const year = Number(filters.year);

    message.value = '';
    error.value = '';
    closeExportMenu();
    isExportingPdf.value = true;

    try {
        const { generateMonthlyFinancialPdf } = await import('@/services/reports/generateMonthlyFinancialPdf');
        const report = await loadMonthlyFinancialReport({
            month,
            year,
            generatedAt: new Date(),
        });

        await generateMonthlyFinancialPdf(report);
        message.value = 'Exportação em PDF iniciada com sucesso.';
    } catch {
        error.value = 'não foi possivel exportar o PDF deste período.';
    } finally {
        isExportingPdf.value = false;
    }
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

const openEditModal = (income) => {
    closeExportMenu();
    editingId.value = income.id;
    form.description = income.description;
    form.amount = formatCurrencyInput(income.amount);
    form.date = toDateInputValue(income.date);
    form.category = income.category;
    form.status = income.status || 'recebido';
    form.type = income.type || inferIncomeType(income.category, 'outros');
    form.notes = income.notes || '';
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

const openDeleteModal = (income) => {
    if (deleting.value) return;
    deleteTarget.value = income;
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
        fieldErrors.description = 'Campo obrigatório (mín. 3 caracteres).';
    }

    if (parseCurrencyInput(form.amount) <= 0) {
        fieldErrors.amount = 'Valor deve ser maior que zero.';
    }

    if (!form.date) {
        fieldErrors.date = 'Selecione uma data válida.';
    }

    if (!String(form.category).trim()) {
        fieldErrors.category = 'Selecione uma categoria.';
    }

    if (!String(form.status).trim()) {
        fieldErrors.status = 'Selecione um estado válido.';
    }

    return !Object.values(fieldErrors).some(Boolean);
};

const destroyTypeChart = () => {
    if (!typeChart) return;

    typeChart.destroy();
    typeChart = null;
};

const clearMessageTimeout = () => {
    if (!messageTimeoutId) return;

    window.clearTimeout(messageTimeoutId);
    messageTimeoutId = null;
};

const renderTypeChart = () => {
    if (!typeChartCanvas.value) return;

    destroyTypeChart();

    typeChart = new Chart(typeChartCanvas.value, {
        type: 'doughnut',
        data: {
            labels: hasTypeData.value ? typeBreakdown.value.map((item) => item.label) : ['Sem receitas'],
            datasets: [
                {
                    data: hasTypeData.value ? typeBreakdown.value.map((item) => item.amount) : [1],
                    backgroundColor: hasTypeData.value ? typeBreakdown.value.map((item) => item.color) : ['#dbe4ee'],
                    borderWidth: 0,
                    hoverOffset: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (!hasTypeData.value) return 'Sem receitas no período selecionado.';

                            const item = typeBreakdown.value[context.dataIndex];
                            return `${item.label}: ${item.share.toFixed(1).replace('.', ',')}%`;
                        },
                    },
                },
            },
        },
    });
};

const loadIncomes = async ({ resetPage = false } = {}) => {
    const requestId = ++lastLoadRequestId;

    loading.value = true;
    error.value = '';

    if (resetPage) {
        currentPage.value = 1;
    }

    try {
        const { data } = await api.get('/incomes', {
            params: {
                month: filters.month,
                year: filters.year,
            },
        });

        if (requestId !== lastLoadRequestId) return;

        incomes.value = Array.isArray(data.data) ? data.data : [];
        totalAmount.value = Number(data.meta?.total_amount || 0);
        serverBreakdown.value = Array.isArray(data.meta?.breakdown_by_type) ? data.meta.breakdown_by_type : [];
        previousPeriod.value = normalizePreviousPeriod(data.meta?.previous_period);
    } catch {
        if (requestId !== lastLoadRequestId) return;

        incomes.value = [];
        totalAmount.value = 0;
        serverBreakdown.value = [];
        previousPeriod.value = createPreviousPeriodState();
        error.value = 'Falha ao carregar receitas.';
    } finally {
        if (requestId === lastLoadRequestId) {
            loading.value = false;
            await nextTick();
            renderTypeChart();
        }
    }
};

const saveIncome = async () => {
    message.value = '';
    error.value = '';

    if (!validateForm()) return;

    const isEditing = Boolean(editingId.value);
    const targetId = editingId.value;
    const payload = {
        description: String(form.description).trim(),
        amount: parseCurrencyInput(form.amount),
        date: form.date,
        category: String(form.category).trim(),
        type: inferIncomeType(form.category, form.type || 'outros'),
        status: form.status,
        notes: String(form.notes || '').trim() || null,
    };

    saving.value = true;

    try {
        if (isEditing) {
            await api.put(`/incomes/${targetId}`, payload);
        } else {
            await api.post('/incomes', payload);
        }

        await loadIncomes();
        message.value = isEditing ? 'Receita atualizada com sucesso.' : 'Receita cadastrada com sucesso.';
        isFormOpen.value = false;
        resetForm();
    } catch (requestError) {
        formError.value = requestError?.response?.data?.message || 'Não foi possível Salvar a receita.';
    } finally {
        saving.value = false;
    }
};

const confirmDeleteIncome = async () => {
    const income = deleteTarget.value;
    if (!income || deleting.value) return;

    message.value = '';
    error.value = '';
    deleting.value = true;

    try {
        await api.delete(`/incomes/${income.id}`);
        clearDeleteModal();
        await loadIncomes();
        message.value = 'Receita excluída com sucesso.';
    } catch {
        error.value = 'Não foi possível excluir a receita.';
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
        saveIncome();
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
    (value) => {
        fieldErrors.category = '';
        formError.value = '';
        form.type = inferIncomeType(value, form.type || 'outros');
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
    loadIncomes({ resetPage: true });
});

watch([searchQuery, sortBy], () => {
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
    loadIncomes({ resetPage: true });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleWindowKeydown);
    document.removeEventListener('click', handleDocumentClick);
    document.body.style.overflow = '';
    clearMessageTimeout();
    destroyTypeChart();
});
</script>

<template>
    <section class="page incomes-page">
        <header class="page-header incomes-header">
            <div class="incomes-header-copy">
                <h2>Controle de Receitas</h2>
                <p>Visão geral das suas entradas do mês e acompanhamento de metas.</p>
            </div>

            <div class="incomes-header-actions">
                <div ref="exportMenuRef" class="export-menu">
                    <button
                        class="btn-ghost incomes-export-trigger"
                        type="button"
                        :disabled="isExportingPdf || isExportingExcel"
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
                            :disabled="isExportingPdf || isExportingExcel"
                            @click="exportToPdf"
                        >
                            <AppIcon name="fileText" :size="16" />
                            <span>
                                <strong>{{ isExportingPdf ? 'Gerando PDF...' : 'Exportar PDF' }}</strong>
                                <small>
                                    {{
                                        isExportingPdf
                                            ? 'Montando relatório nativo do período selecionado.'
                                            : 'Layout pronto para impressao e compartilhamento.'
                                    }}
                                </small>
                            </span>
                        </button>

                        <button
                            class="export-menu-item export-menu-item-excel"
                            type="button"
                            role="menuitem"
                            :disabled="isExportingPdf || isExportingExcel"
                            @click="exportToExcel"
                        >
                            <AppIcon name="fileSpreadsheet" :size="16" />
                            <span>
                                <strong>{{ isExportingExcel ? 'Gerando Excel...' : 'Exportar Excel' }}</strong>
                                <small>
                                    {{
                                        isExportingExcel
                                            ? 'Montando a planilha nativa do período selecionado.'
                                            : 'Planilha .xlsx com layout mensal, filtro e saldo final.'
                                    }}
                                </small>
                            </span>
                        </button>
                    </div>
                </div>

                <button class="btn-primary incomes-header-action" type="button" @click="openCreateModal">
                    <AppIcon name="plus" :size="17" />
                    <span>Nova Receita</span>
                </button>
            </div>
        </header>

        <section class="cards-grid incomes-summary-grid">
            <template v-if="loading">
                <article v-for="index in 4" :key="`skeleton-kpi-${index}`" class="metric-card income-summary-card skeleton-card">
                    <span class="skeleton-line skeleton-line-sm" />
                    <span class="skeleton-line skeleton-line-lg" />
                    <span class="skeleton-line skeleton-line-md" />
                </article>
            </template>

            <template v-else>
                <article v-for="card in kpiCards" :key="card.id" class="metric-card income-summary-card" :class="`tone-${card.tone}`">
                    <div class="income-summary-head">
                        <h3>{{ card.title }}</h3>
                        <span class="income-summary-icon">
                            <AppIcon :name="card.icon" :size="18" />
                        </span>
                    </div>

                    <strong :class="{ 'finance-amount': card.isMoney }">{{ card.value }}</strong>
                    <p class="metric-description">{{ card.description }}</p>
                </article>
            </template>
        </section>

        <div class="incomes-workspace-grid">
            <section class="panel incomes-workspace">
                <div v-if="loading" class="incomes-toolbar">
                    <span class="skeleton-box skeleton-input" />
                    <div class="incomes-toolbar-filters">
                        <span class="skeleton-box skeleton-filter" />
                        <span class="skeleton-box skeleton-filter" />
                        <span class="skeleton-box skeleton-filter" />
                    </div>
                </div>

                <div v-else class="incomes-toolbar">
                    <label class="incomes-toolbar-search">
                        <span>Buscar</span>
                        <div class="search-field income-search-field">
                            <AppIcon name="search" :size="16" />
                            <input
                                v-model="searchQuery"
                                type="text"
                                placeholder="Buscar descrição, categoria, tipo..."
                                aria-label="Buscar descrição, categoria ou tipo"
                            />
                        </div>
                    </label>

                    <div class="incomes-toolbar-filters">
                        <label>
                            <span>Mês</span>
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

                        <label>
                            <span>Ordenação</span>
                            <select v-model="sortBy">
                                <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                    </div>
                </div>

                <p v-if="message" class="success-text income-feedback">{{ message }}</p>
                <p v-if="error" class="error-text income-feedback">{{ error }}</p>

                <div v-if="loading" class="income-table-skeleton">
                    <span class="skeleton-line skeleton-line-table-head" />
                    <span v-for="index in 5" :key="`skeleton-row-${index}`" class="skeleton-row" />
                </div>

                <template v-else-if="paginatedIncomes.length">
                    <div class="table-wrap income-table-wrap">
                        <table class="income-table">
                            <colgroup>
                                <col class="income-col-date" />
                                <col class="income-col-description" />
                                <col class="income-col-category" />
                                <col class="income-col-status" />
                                <col class="income-col-value" />
                                <col class="income-col-actions" />
                            </colgroup>

                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th>Categoria</th>
                                    <th>Estado</th>
                                    <th class="align-right">Valor</th>
                                    <th class="align-center">Ações</th>
                                </tr>
                            </thead>

                            <tbody>
                                <tr v-for="income in paginatedIncomes" :key="income.id">
                                    <td class="income-date-cell">{{ formatDate(income.date) }}</td>

                                    <td class="income-description-cell">
                                        <div class="income-description-stack">
                                            <strong>{{ income.description }}</strong>
                                            <small>{{ income.notes || humanizeLabel(income.category) }}</small>
                                        </div>
                                    </td>

                                    <td>
                                        <span class="income-category-chip" :class="`tone-${incomeTypeTone(income.type)}`">
                                            {{ humanizeLabel(income.category) }}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="income-status-indicator">
                                            <span class="income-status-dot" :class="`tone-${incomeStatusTone(income.status)}`" />
                                            <span>{{ incomeStatusLabel(income.status) }}</span>
                                        </span>
                                    </td>

                                    <td class="money-cell">
                                        <div class="money-cell-inner">
                                            <strong class="finance-amount">{{ formatCurrency(income.amount) }}</strong>
                                        </div>
                                    </td>

                                    <td class="actions-cell">
                                        <div class="actions-cell-inner row-actions icon-actions">
                                            <button
                                                type="button"
                                                class="btn-icon btn-edit"
                                                title="Editar receita"
                                                aria-label="Editar receita"
                                                @click="openEditModal(income)"
                                            >
                                                <AppIcon name="edit" :size="15" />
                                            </button>

                                            <button
                                                type="button"
                                                class="btn-icon btn-delete"
                                                title="Excluir receita"
                                                aria-label="Excluir receita"
                                                @click="openDeleteModal(income)"
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
                        <nav class="table-pagination" aria-label="Paginação das receitas">
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
                                :key="`page-${page}`"
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

                <div v-else class="income-empty-state-panel">
                    <div class="income-empty-illustration">
                        <AppIcon :name="searchQuery.trim() ? 'search' : 'wallet'" :size="28" />
                    </div>

                    <h3>{{ emptyStateCopy.title }}</h3>
                    <p>{{ emptyStateCopy.description }}</p>

                    <button v-if="searchQuery.trim()" class="btn-ghost" type="button" @click="clearSearch">
                        {{ emptyStateCopy.button }}
                    </button>

                    <button v-else class="btn-primary" type="button" @click="openCreateModal">
                        <AppIcon name="plus" :size="16" />
                        <span>{{ emptyStateCopy.button }}</span>
                    </button>
                </div>
            </section>

            <aside class="panel income-composition-panel">
                <div class="income-side-card-head">
                    <h3>Composição das Receitas</h3>
                </div>

                <div class="income-type-chart-shell">
                    <div class="chart-holder income-type-chart-holder">
                        <canvas ref="typeChartCanvas" />

                        <div class="income-chart-center" aria-hidden="true">
                            <span>Total</span>
                            <strong>{{ chartCenterValue }}</strong>
                        </div>
                    </div>
                </div>

                <div v-if="hasTypeData" class="income-composition-legend">
                    <article v-for="item in typeBreakdown" :key="item.value" class="composition-legend-item">
                        <div class="composition-legend-label">
                            <span class="category-dot" :style="{ backgroundColor: item.color }" />
                            <span>{{ item.label }}</span>
                        </div>

                        <strong>{{ item.share.toFixed(1).replace('.', ',') }}%</strong>
                    </article>
                </div>

                <div v-else class="income-composition-empty">
                    <p>Sem receitas no período selecionado.</p>
                </div>

                <p class="income-composition-note">{{ compositionInsight }}</p>
            </aside>
        </div>

        <Teleport to="body">
            <Transition name="modal-fade">
                <div v-if="isFormOpen" class="modal-backdrop" @click.self="closeFormModal">
                    <section class="modal-panel income-form-modal" role="dialog" aria-modal="true" aria-labelledby="income-form-title">
                        <div class="income-form-modal-header">
                            <div>
                                <h3 id="income-form-title">
                                    {{ editingId ? 'Editar receita' : 'Cadastrar nova receita' }}
                                </h3>
                                <p>Use categorias consistentes para manter relatórios e composição mais claros nos próximos meses.</p>
                            </div>

                            <button
                                type="button"
                                class="btn-icon btn-icon-ghost"
                                aria-label="Fechar formulário"
                                @click="closeFormModal"
                            >
                                <AppIcon name="close" :size="18" />
                            </button>
                        </div>

                        <form class="income-form-layout" @submit.prevent="saveIncome">
                            <label class="modal-field">
                                <span class="modal-field-label">
                                    Descrição
                                    <span class="required-mark">*</span>
                                </span>
                                <input
                                    ref="descriptionInput"
                                    v-model="form.description"
                                    class="modal-input-shell"
                                    :class="{ 'has-error': fieldErrors.description }"
                                    type="text"
                                    placeholder="Ex.: Salário principal"
                                    autocomplete="off"
                                    required
                                />
                                <span v-if="fieldErrors.description" class="modal-field-error">
                                    <AppIcon name="alert" :size="14" />
                                    <span>{{ fieldErrors.description }}</span>
                                </span>
                            </label>

                            <div class="income-form-row">
                                <label class="modal-field">
                                    <span class="modal-field-label">
                                        Valor
                                        <span class="required-mark">*</span>
                                    </span>
                                    <div class="modal-input-shell modal-currency-field" :class="{ 'has-error': fieldErrors.amount }">
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

                            <div class="income-form-row">
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
                                        <option v-for="category in categoryOptions" :key="category" :value="category">
                                            {{ category }}
                                        </option>
                                    </select>
                                    <small class="modal-category-hint">{{ featuredCategoriesText }}</small>
                                    <span v-if="fieldErrors.category" class="modal-field-error">
                                        <AppIcon name="alert" :size="14" />
                                        <span>{{ fieldErrors.category }}</span>
                                    </span>
                                </label>

                                <label class="modal-field">
                                    <span class="modal-field-label">
                                        Estado
                                        <span class="required-mark">*</span>
                                    </span>
                                    <select
                                        v-model="form.status"
                                        class="modal-input-shell"
                                        :class="{ 'has-error': fieldErrors.status }"
                                        required
                                    >
                                        <option v-for="status in incomeStatuses" :key="status.value" :value="status.value">
                                            {{ status.label }}
                                        </option>
                                    </select>
                                    <span v-if="fieldErrors.status" class="modal-field-error">
                                        <AppIcon name="alert" :size="14" />
                                        <span>{{ fieldErrors.status }}</span>
                                    </span>
                                </label>
                            </div>

                            <label class="modal-field">
                                <span class="modal-field-label">Observação</span>
                                <textarea
                                    v-model="form.notes"
                                    class="modal-input-shell modal-notes-field"
                                    rows="4"
                                    placeholder="Adicione detalhes opcionais..."
                                />
                            </label>

                            <p v-if="formError" class="error-text modal-form-error">{{ formError }}</p>

                            <div class="income-form-actions">
                                <button class="btn-primary income-submit-btn" type="submit" :disabled="saving">
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
            :income-name="deleteTarget?.description || ''"
            :loading="deleting"
            @close="closeDeleteModal"
            @confirm="confirmDeleteIncome"
        />
    </section>
</template>
