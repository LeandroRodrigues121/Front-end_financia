<script setup>
import { Chart, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { humanizeLabel, incomeTypeLabel, monthOptions } from '@/utils/labels';

Chart.register(...registerables);

const ROWS_PER_PAGE = 5;

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

const baseCategorySuggestions = ['Trabalho', 'Freelance', 'Benefícios', 'Comissões', 'Investimentos', 'Vendas', 'Outros'];

const sortOptions = [
    { value: 'date_desc', label: 'Mais recentes' },
    { value: 'date_asc', label: 'Mais antigas' },
    { value: 'amount_desc', label: 'Maior valor' },
    { value: 'amount_asc', label: 'Menor valor' },
    { value: 'description_asc', label: 'Descrição' },
];

const createFormState = () => ({
    description: '',
    amount: '',
    date: getTodayInputValue(),
    category: '',
    type: 'salario',
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
const searchQuery = ref('');
const sortBy = ref('date_desc');
const currentPage = ref(1);
const descriptionInput = ref(null);
const typeChartCanvas = ref(null);
const serverBreakdown = ref([]);

let typeChart = null;
let lastLoadRequestId = 0;
let messageTimeoutId = null;

const totalCount = computed(() => incomes.value.length);

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

const categorySuggestions = computed(() =>
    [...new Set([...baseCategorySuggestions, ...incomes.value.map((income) => String(income.category || '').trim()).filter(Boolean)])]
        .sort((leftCategory, rightCategory) => leftCategory.localeCompare(rightCategory, 'pt-BR')),
);

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

const resetForm = () => {
    Object.assign(form, createFormState());
    formError.value = '';
    editingId.value = null;
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
    form.amount = String(income.amount ?? '');
    form.date = toDateInputValue(income.date);
    form.category = income.category;
    form.type = income.type;
    form.notes = income.notes || '';
    formError.value = '';
    isFormOpen.value = true;
    focusDescriptionField();
};

const closeFormModal = () => {
    isFormOpen.value = false;
    resetForm();
};

const clearSearch = () => {
    searchQuery.value = '';
};

const validateForm = () => {
    if (!String(form.description).trim()) {
        formError.value = 'Informe a descrição da receita.';
        return false;
    }

    if (Number(form.amount) <= 0) {
        formError.value = 'O valor da receita deve ser maior que zero.';
        return false;
    }

    if (!form.date) {
        formError.value = 'Informe a data da receita.';
        return false;
    }

    if (!String(form.category).trim()) {
        formError.value = 'Informe uma categoria.';
        return false;
    }

    formError.value = '';
    return true;
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
        amount: Number(form.amount),
        date: form.date,
        category: String(form.category).trim(),
        type: form.type,
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

const removeIncome = async (income) => {
    const confirmed = window.confirm(`Remover a receita "${income.description}"?`);
    if (!confirmed) return;

    message.value = '';
    error.value = '';

    try {
        await api.delete(`/incomes/${income.id}`);
        await loadIncomes();
        message.value = 'Receita removida com sucesso.';
    } catch {
        error.value = 'Não foi possível remover a receita.';
    }
};

const goToPage = (page) => {
    currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
};

const handleWindowKeydown = (event) => {
    if (event.key === 'Escape' && isFormOpen.value && !saving.value) {
        closeFormModal();
    }
};

watch(isFormOpen, (value) => {
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
                                                    @click="removeIncome(income)"
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
                                aria-label="Fechar formulario"
                                @click="closeFormModal"
                            >
                                <AppIcon name="close" :size="18" />
                            </button>
                        </div>

                        <form class="form-grid" @submit.prevent="saveIncome">
                            <label class="full">
                                Descrição
                                <input
                                    ref="descriptionInput"
                                    v-model="form.description"
                                    type="text"
                                    placeholder="Ex.: Salário principal"
                                    required
                                />
                            </label>

                            <label>
                                Valor
                                <input
                                    v-model="form.amount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    inputmode="decimal"
                                    placeholder="0,00"
                                    required
                                />
                            </label>

                            <label>
                                Data
                                <input v-model="form.date" type="date" required />
                            </label>

                            <label>
                                Tipo
                                <select v-model="form.type" required>
                                    <option v-for="type in incomeTypes" :key="type.value" :value="type.value">
                                        {{ type.label }}
                                    </option>
                                </select>
                            </label>

                            <label>
                                Categoria
                                <input
                                    v-model="form.category"
                                    type="text"
                                    list="income-category-options"
                                    placeholder="Selecione ou digite uma categoria"
                                    required
                                />
                            </label>

                            <datalist id="income-category-options">
                                <option v-for="category in categorySuggestions" :key="category" :value="category" />
                            </datalist>

                            <label class="full">
                                Observação
                                <textarea
                                    v-model="form.notes"
                                    rows="4"
                                    placeholder="Adicione contexto para lembrar a origem dessa entrada."
                                />
                            </label>

                            <small class="full form-helper-text">
                                Sugestão: use sempre o mesmo nome para categorias recorrentes.
                            </small>

                            <p v-if="formError" class="error-text full">{{ formError }}</p>

                            <div class="actions">
                                <button class="btn-primary" type="submit" :disabled="saving">
                                    <AppIcon :name="editingId ? 'edit' : 'plus'" :size="15" />
                                    <span>{{ formSubmitLabel }}</span>
                                </button>
                                <button class="btn-ghost" type="button" @click="closeFormModal" :disabled="saving">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            </Transition>
        </Teleport>
    </section>
</template>
