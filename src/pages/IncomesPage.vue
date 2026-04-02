<script setup>
import { Chart, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { humanizeLabel, incomeTypeLabel, monthOptions } from '@/utils/labels';

const ROWS_PER_PAGE = 5;

const incomeShareLabelsPlugin = {
    id: 'incomeShareLabelsPlugin',
    afterDatasetsDraw(chart, _args, pluginOptions) {
        if (!pluginOptions?.enabled) return;

        const dataset = chart.data?.datasets?.[0];
        const meta = chart.getDatasetMeta(0);
        const arcs = meta?.data || [];
        const values = (dataset?.data || []).map((value) => Number(value || 0));
        const total = values.reduce((sum, value) => sum + value, 0);

        if (!dataset || !arcs.length || total <= 0) return;

        const { ctx } = chart;
        ctx.save();

        arcs.forEach((arc, index) => {
            const value = values[index] || 0;
            if (value <= 0) return;

            const share = (value / total) * 100;
            const { startAngle, endAngle, innerRadius, outerRadius, x: centerX, y: centerY } = arc.getProps(
                ['startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'x', 'y'],
                true,
            );
            const angle = (startAngle + endAngle) / 2;
            const radiusFactor = share < 12 ? 0.72 : 0.6;
            const radius = innerRadius + (outerRadius - innerRadius) * radiusFactor;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            const fontSize = share < 12 ? 11 : 13;

            ctx.font = `700 ${fontSize}px Manrope, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(19, 32, 25, 0.16)';
            ctx.fillStyle = '#ffffff';

            const label = `${share.toFixed(1).replace('.', ',')}%`;
            ctx.strokeText(label, x, y);
            ctx.fillText(label, x, y);
        });

        ctx.restore();
    },
};

Chart.register(...registerables, incomeShareLabelsPlugin);

const getTodayInputValue = () => {
    const now = new Date();
    const timezoneAdjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return timezoneAdjusted.toISOString().slice(0, 10);
};

const incomeTypes = [
    { value: 'salario', label: 'Salário', tone: 'positive', color: '#1f9b90' },
    { value: 'renda_extra', label: 'Renda extra', tone: 'warning', color: '#ff922b' },
    { value: 'rendimento_investimento', label: 'Rendimento de investimento', tone: 'info', color: '#2563eb' },
    { value: 'outros', label: 'Outros', tone: 'neutral', color: '#86938b' },
];

const baseCategoryOptions = [
    { value: 'Salário', type: 'salario' },
    { value: 'Freelance', type: 'renda_extra' },
    { value: 'Investimento', type: 'rendimento_investimento' },
    { value: 'Aluguel', type: 'renda_extra' },
    { value: 'Vendas', type: 'renda_extra' },
    { value: 'Outros', type: 'outros' },
];

const featuredCategoryLabels = ['Salário', 'Freelance', 'Investimento', 'Outros'];

const sortOptions = [
    { value: 'date_desc', label: 'Mais recentes' },
    { value: 'date_asc', label: 'Mais antigas' },
    { value: 'amount_desc', label: 'Maior valor' },
    { value: 'amount_asc', label: 'Menor valor' },
    { value: 'description_asc', label: 'Descrição' },
];

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const formatCurrencyInput = (value) => {
    const amount = parseCurrencyInput(value);
    if (!amount) return '';

    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

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

const toCurrencyDraft = (value) => {
    const amount = parseCurrencyInput(value);
    if (!amount) return '';

    const hasDecimals = Math.round(amount * 100) % 100 !== 0;
    if (!hasDecimals) {
        return String(Math.trunc(amount));
    }

    return amount.toFixed(2).replace('.', ',');
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
    if (
        normalized.includes('freela') ||
        normalized.includes('alugu') ||
        normalized.includes('vend') ||
        normalized.includes('projet')
    ) {
        return 'renda_extra';
    }
    if (normalized.includes('outro')) return 'outros';

    return fallback;
};

const createFormState = () => ({
    description: '',
    amount: '',
    date: getTodayInputValue(),
    category: '',
    type: 'outros',
    notes: '',
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
const message = ref('');
const error = ref('');
const formError = ref('');
const editingId = ref(null);
const isFormOpen = ref(false);
const deleteTarget = ref(null);
const deleting = ref(false);
const searchQuery = ref('');
const sortBy = ref('date_desc');
const currentPage = ref(1);
const descriptionInput = ref(null);
const typeChartCanvas = ref(null);
const serverBreakdown = ref([]);
const fieldErrors = reactive({
    description: '',
    amount: '',
    date: '',
    category: '',
});

let typeChart = null;
let lastLoadRequestId = 0;
let messageTimeoutId = null;

const totalCount = computed(() => incomes.value.length);
const isDeleteModalOpen = computed(() => Boolean(deleteTarget.value));
const isAnyModalOpen = computed(() => isFormOpen.value || isDeleteModalOpen.value);

const periodLabel = computed(() => {
    const month = monthOptions.find((item) => item.value === Number(filters.month));
    return `${month?.label || 'Mês'} de ${filters.year}`;
});

const yearOptions = computed(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([filters.year]);

    for (let year = currentYear + 1; year >= currentYear - 4; year -= 1) {
        years.add(year);
    }

    return [...years].sort((leftYear, rightYear) => rightYear - leftYear);
});

const averageAmount = computed(() => {
    if (!totalCount.value) return 0;
    return totalAmount.value / totalCount.value;
});

const largestIncome = computed(() =>
    incomes.value.reduce((largest, currentIncome) => {
        if (!largest) return currentIncome;
        return Number(currentIncome.amount) > Number(largest.amount) ? currentIncome : largest;
    }, null),
);

const uniqueCategoriesCount = computed(
    () =>
        new Set(
            incomes.value
                .map((income) => String(income.category || '').trim().toLowerCase())
                .filter(Boolean),
        ).size,
);

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

const featuredCategoriesText = computed(() => featuredCategoryLabels.join(', '));

const filteredIncomes = computed(() => {
    let rows = [...incomes.value];

    if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase();
        rows = rows.filter((income) =>
            [income.description, income.category, income.type, income.notes]
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

const sideActionCopy = computed(() => {
    if (totalCount.value > 0) {
        return {
            title: 'Lançar nova receita',
            description: 'Mantenha o painel atualizado com as entradas mais recentes do período.',
            button: 'Nova Receita',
        };
    }

    return {
        title: 'Nenhuma receita neste período',
        description: 'Que tal registrar a primeira entrada para iniciar a leitura do mês?',
        button: 'Lançar primeira receita',
    };
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
        description: `Que tal lançar a primeira receita de ${periodLabel.value} e começar a leitura do painel?`,
        button: 'Nova Receita',
    };
});

const formSubmitLabel = computed(() => {
    if (saving.value) return 'Salvando...';
    return editingId.value ? 'Atualizar receita' : 'Salvar receita';
});

const kpiCards = computed(() => [
    {
        id: 'income-total',
        title: 'Total no período',
        tone: 'positive',
        value: formatCurrency(totalAmount.value),
        description: totalCount.value
            ? `${totalCount.value} ${totalCount.value === 1 ? 'entrada confirmada' : 'entradas confirmadas'}`
            : 'Sem entradas confirmadas',
        isMoney: true,
    },
    {
        id: 'income-average',
        title: 'Ticket médio',
        tone: 'info',
        value: formatCurrency(averageAmount.value),
        description: totalCount.value ? 'Média por lançamento no período' : 'Aguardando receitas para calcular',
        isMoney: true,
    },
    {
        id: 'income-lead-type',
        title: 'Origem líder',
        tone: leadType.value?.tone || 'neutral',
        value: leadType.value ? incomeTypeLabel(leadType.value.value) : 'Sem dados',
        description: leadType.value
            ? `${formatCurrency(leadType.value.amount)} - ${leadType.value.share.toFixed(1).replace('.', ',')}% do total`
            : 'Sem composição suficiente para liderança',
        isMoney: false,
    },
    {
        id: 'income-categories',
        title: 'Categorias ativas',
        tone: uniqueCategoriesCount.value > 0 ? 'warning' : 'neutral',
        value: String(uniqueCategoriesCount.value),
        description: largestIncome.value
            ? `Maior entrada: ${largestIncome.value.description}`
            : 'Padronize categorias para relatórios melhores',
        isMoney: false,
    },
]);

const incomeTypeTone = (typeValue) => incomeTypes.find((type) => type.value === typeValue)?.tone || 'neutral';

const clearFieldErrors = () => {
    fieldErrors.description = '';
    fieldErrors.amount = '';
    fieldErrors.date = '';
    fieldErrors.category = '';
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
    resetForm();
    isFormOpen.value = true;
    focusDescriptionField();
};

const openEditModal = (income) => {
    editingId.value = income.id;
    form.description = income.description;
    form.amount = formatCurrencyInput(income.amount);
    form.date = toDateInputValue(income.date);
    form.category = income.category;
    form.type = income.type;
    form.notes = income.notes || '';
    clearFieldErrors();
    formError.value = '';
    isFormOpen.value = true;
    focusDescriptionField();
};

const closeFormModal = () => {
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
                    backgroundColor: hasTypeData.value ? typeBreakdown.value.map((item) => item.color) : ['#dce6e2'],
                    borderWidth: 0,
                    hoverOffset: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    display: false,
                },
                incomeShareLabelsPlugin: {
                    enabled: hasTypeData.value,
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (!hasTypeData.value) return 'Sem receitas no período selecionado.';

                            const item = typeBreakdown.value[context.dataIndex];
                            return `${item.label}: ${formatCurrency(context.parsed || 0)} (${item.share.toFixed(1).replace('.', ',')}%)`;
                        },
                    },
                },
            },
        },
    });
};

const loadIncomes = async ({ resetPage = false } = {}) => {
    const requestId = ++lastLoadRequestId;
    let shouldRenderChart = false;

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
        shouldRenderChart = true;
    } catch {
        if (requestId !== lastLoadRequestId) return;
        error.value = 'Falha ao carregar receitas.';
    } finally {
        if (requestId === lastLoadRequestId) {
            loading.value = false;
        }
    }

    if (!shouldRenderChart || requestId !== lastLoadRequestId) return;

    await nextTick();
    renderTypeChart();
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
        closeFormModal();
    } catch (requestError) {
        formError.value = requestError?.response?.data?.message || 'Não foi possível salvar a receita.';
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

const handleWindowKeydown = (event) => {
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
    loadIncomes({ resetPage: true });
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleWindowKeydown);
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
                <p>Um painel mais direto para entender o mês, registrar novas entradas e agir sem atrito.</p>
            </div>
        </header>

        <div v-if="loading" class="incomes-layout">
            <div class="incomes-main-column">
                <section class="cards-grid incomes-summary-grid">
                    <article v-for="index in 4" :key="`skeleton-kpi-${index}`" class="metric-card income-summary-card skeleton-card">
                        <span class="skeleton-line skeleton-line-sm" />
                        <span class="skeleton-line skeleton-line-lg" />
                        <span class="skeleton-line skeleton-line-md" />
                    </article>
                </section>

                <section class="panel incomes-workspace">
                    <div class="incomes-toolbar">
                        <span class="skeleton-box skeleton-button" />
                        <span class="skeleton-box skeleton-input" />
                        <div class="incomes-toolbar-filters">
                            <span class="skeleton-box skeleton-filter" />
                            <span class="skeleton-box skeleton-filter" />
                            <span class="skeleton-box skeleton-filter" />
                        </div>
                    </div>

                    <div class="income-table-skeleton">
                        <span class="skeleton-line skeleton-line-table-head" />
                        <span v-for="index in 5" :key="`skeleton-row-${index}`" class="skeleton-row" />
                    </div>
                </section>
            </div>

            <aside class="incomes-side-column">
                <article class="panel income-composition-panel skeleton-card">
                    <span class="skeleton-line skeleton-line-sm" />
                    <span class="skeleton-circle" />
                    <span class="skeleton-line skeleton-line-md" />
                    <span class="skeleton-line skeleton-line-md" />
                </article>

                <article class="panel income-side-action-card skeleton-card">
                    <span class="skeleton-icon" />
                    <span class="skeleton-line skeleton-line-md" />
                    <span class="skeleton-line skeleton-line-lg" />
                    <span class="skeleton-box skeleton-button skeleton-button-full" />
                </article>
            </aside>
        </div>

        <div v-else class="incomes-layout">
            <div class="incomes-main-column">
                <section class="cards-grid incomes-summary-grid">
                    <article v-for="card in kpiCards" :key="card.id" class="metric-card income-summary-card" :class="`tone-${card.tone}`">
                        <h3>{{ card.title }}</h3>
                        <strong :class="{ 'finance-amount': card.isMoney }">{{ card.value }}</strong>
                        <p class="metric-description">{{ card.description }}</p>
                    </article>
                </section>

                <section class="panel incomes-workspace">
                    <div class="incomes-toolbar">
                        <button class="btn-primary incomes-main-action" type="button" @click="openCreateModal">
                            <AppIcon name="plus" :size="16" />
                            <span>Nova Receita</span>
                        </button>

                        <label class="table-search incomes-toolbar-search">
                            Buscar
                            <div class="search-field">
                                <AppIcon name="search" :size="14" />
                                <input v-model="searchQuery" type="text" placeholder="Buscar descrição, categoria, tipo..." />
                            </div>
                        </label>

                        <div class="incomes-toolbar-filters">
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
                                <select v-model.number="filters.year">
                                    <option v-for="year in yearOptions" :key="year" :value="year">
                                        {{ year }}
                                    </option>
                                </select>
                            </label>

                            <label>
                                Ordenação
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

                    <template v-if="paginatedIncomes.length">
                        <div class="table-wrap income-table-wrap">
                            <table class="income-table">
                                <colgroup>
                                    <col class="income-col-date" />
                                    <col class="income-col-description" />
                                    <col class="income-col-category" />
                                    <col class="income-col-type" />
                                    <col class="income-col-value" />
                                    <col class="income-col-actions" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>
                                            <div class="table-head-stack">
                                                <span>Descrição</span>
                                            </div>
                                        </th>
                                        <th>Categoria</th>
                                        <th>Tipo</th>
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
                                            <span class="status-pill income-type-pill" :class="`tone-${incomeTypeTone(income.type)}`">
                                                {{ incomeTypeLabel(income.type) }}
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
                            <AppIcon name="wallet" :size="32" />
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
            </div>

            <aside class="incomes-side-column">
                <article class="panel income-composition-panel">
                    <div class="income-side-card-head">
                        <h3>Composição das receitas</h3>
                    </div>

                    <div class="chart-holder income-type-chart-holder">
                        <canvas ref="typeChartCanvas" />
                    </div>

                    <div v-if="hasTypeData" class="income-composition-legend">
                        <article v-for="item in typeBreakdown" :key="item.value" class="composition-legend-item">
                            <div class="composition-legend-label">
                                <span class="category-dot" :style="{ backgroundColor: item.color }" />
                                <span>{{ item.label }}</span>
                            </div>
                            <strong class="finance-amount">{{ formatCurrency(item.amount) }}</strong>
                            <small>{{ item.share.toFixed(1).replace('.', ',') }}%</small>
                        </article>
                    </div>

                    <p class="income-composition-note">{{ compositionInsight }}</p>
                </article>

                <article v-if="!totalCount" class="panel income-side-action-card">
                    <div class="income-side-action-visual">
                        <AppIcon name="wallet" :size="32" />
                    </div>
                    <strong>{{ sideActionCopy.title }}</strong>
                    <p>{{ sideActionCopy.description }}</p>
                    <button class="btn-primary income-side-action-btn" type="button" @click="openCreateModal">
                        <span>{{ sideActionCopy.button }}</span>
                    </button>
                </article>
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
                                <p>Use categorias consistentes para manter relatórios mais limpos nos próximos meses.</p>
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
                                <button
                                    class="btn-cancel-link"
                                    type="button"
                                    @click="closeFormModal"
                                    :disabled="saving"
                                >
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
