<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal.vue';
import api from '@/services/api';
import { buildDebtSituationReport } from '@/services/reports/buildDebtSituationReport';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { statusLabel } from '@/utils/labels';

const today = new Date().toISOString().slice(0, 10);
const statuses = ['pendente', 'paga', 'atrasada'];

const getInitialFormState = () => ({
    description: '',
    total_amount: '',
    paid_amount: '',
    due_date: today,
    status: 'pendente',
    notes: '',
    installments: '',
    notify: true,
});

const form = reactive(getInitialFormState());
const filters = reactive({
    status: '',
});

const debts = ref([]);
const totals = ref({
    total_amount: 0,
    paid_amount: 0,
    remaining_amount: 0,
});
const message = ref('');
const error = ref('');
const formError = ref('');
const editingId = ref(null);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const searchQuery = ref('');
const isFormOpen = ref(false);
const formMode = ref('create');
const debtPendingDelete = ref(null);
const exportMenuRef = ref(null);
const isExportMenuOpen = ref(false);
const isExportingPdf = ref(false);
const isExportingExcel = ref(false);

const startOfToday = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);

const filteredDebts = computed(() => {
    let rows = [...debts.value];

    if (searchQuery.value.trim()) {
        const query = searchQuery.value.trim().toLowerCase();
        rows = rows.filter((debt) =>
            [debt.description, debt.status, debt.notes, debt.due_date]
                .map((value) => String(value || '').toLowerCase())
                .some((value) => value.includes(query)),
        );
    }

    return rows;
});

const completionPercent = computed(() => {
    const total = Number(totals.value.total_amount || 0);
    const paid = Number(totals.value.paid_amount || 0);
    return total > 0 ? (paid / total) * 100 : 0;
});

const completionDisplay = computed(() => Math.round(Math.min(completionPercent.value, 100)));

const activeDebtCount = computed(() =>
    debts.value.filter((debt) => Number(debt.remaining_amount || 0) > 0).length,
);

const overdueCount = computed(() => debts.value.filter((debt) => debt.status === 'atrasada').length);

const upcomingDebt = computed(() => {
    const openDebts = debts.value
        .filter((debt) => debt.status !== 'paga' && debt.due_date)
        .slice()
        .sort((left, right) => new Date(left.due_date) - new Date(right.due_date));

    return openDebts[0] || null;
});

const totalContractsLabel = computed(() => {
    if (!activeDebtCount.value) {
        return 'Nenhum contrato ativo';
    }

    return activeDebtCount.value === 1 ? '1 contrato ativo' : `${activeDebtCount.value} contratos ativos`;
});

const paidRatioLabel = computed(() => {
    if (!Number(totals.value.total_amount || 0)) {
        return 'Nenhum pagamento registrado';
    }

    return `${completionDisplay.value}% do montante total`;
});

const remainingDescription = computed(() => {
    if (!activeDebtCount.value) {
        return 'Nenhuma parcela em aberto';
    }

    if (!upcomingDebt.value) {
        return 'Sem vencimentos programados';
    }

    return dueHint(upcomingDebt.value);
});

const completionTagline = computed(() => {
    if (!Number(totals.value.total_amount || 0)) {
        return 'Rumo a sua liberdade!';
    }

    if (completionDisplay.value >= 100) {
        return 'Liberdade conquistada!';
    }

    if (overdueCount.value > 0) {
        return `${overdueCount.value} contrato(s) precisa(m) de atenção`;
    }

    return 'Rumo a liberdade!';
});

const modalTitle = computed(() => {
    if (formMode.value === 'view') {
        return 'Detalhes da Dívida';
    }

    return editingId.value ? 'Editar Dívida' : 'Registrar Dívida';
});

const modalDescription = computed(() => {
    if (formMode.value === 'view') {
        return 'Consulte o montante, o progresso e o próximo vencimento deste contrato.';
    }

    return editingId.value
        ? 'Atualize os valores pagos e mantenha o seu plano de quitação em dia.'
        : 'Planeie as suas parcelas e juros para uma quitação mais organizada.';
});

const submitLabel = computed(() => (editingId.value ? 'Atualizar Dívida' : 'Registrar Dívida'));
const filterButtonLabel = computed(() => (loading ? 'Filtrando...' : 'Filtrar'));
const isReadonly = computed(() => formMode.value === 'view');

const debtProgress = (debt) => {
    const total = Number(debt.total_amount || 0);
    const paid = Number(debt.paid_amount || 0);

    if (total <= 0) {
        return 0;
    }

    return Math.min(Math.round((paid / total) * 100), 100);
};

const dueHint = (debt) => {
    if (!debt?.due_date) return 'Sem vencimento';
    if (debt.status === 'paga') return 'Quitada';

    const due = new Date(`${String(debt.due_date).slice(0, 10)}T00:00:00`);
    const diffInDays = Math.ceil((due - startOfToday()) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
        const days = Math.abs(diffInDays);
        return `Vencida há ${days} dia${days === 1 ? '' : 's'}`;
    }

    if (diffInDays === 0) return 'Vence hoje';
    if (diffInDays === 1) return 'Vence amanhã';

    return `Vence em ${diffInDays} dias`;
};

const dueToneClass = (debt) => {
    if (debt.status === 'paga') return 'is-paid';
    if (debt.status === 'atrasada') return 'is-overdue';
    return 'is-upcoming';
};

const debtMetaLabel = (debt) => {
    const note = String(debt.notes || '').trim();

    if (note) {
        return note.toUpperCase();
    }

    if (debt.status === 'paga') {
        return 'QUITADA / CONTRATO ENCERRADO';
    }

    if (debt.status === 'atrasada') {
        return 'ATENÇÃO / PARCELA EM ATRASO';
    }

    return 'CONTRATO ATIVO / ACOMPANHAMENTO';
};

const resolveFormStatus = () => {
    const total = Number(form.total_amount || 0);
    const paid = Number(form.paid_amount || 0);

    if (total > 0 && paid >= total) {
        return 'paga';
    }

    if (form.due_date) {
        const due = new Date(`${form.due_date}T00:00:00`);
        if (due < startOfToday()) {
            return 'atrasada';
        }
    }

    return 'pendente';
};

const resetForm = () => {
    Object.assign(form, getInitialFormState());
    editingId.value = null;
    formMode.value = 'create';
    formError.value = '';
};

const closeExportMenu = () => {
    isExportMenuOpen.value = false;
};

const toggleExportMenu = () => {
    isExportMenuOpen.value = !isExportMenuOpen.value;
};

const buildCurrentDebtReport = () =>
    buildDebtSituationReport({
        debts: filteredDebts.value,
        generatedAt: new Date(),
    });

const exportToPdf = async () => {
    if (isExportingPdf.value) return;

    message.value = '';
    error.value = '';
    closeExportMenu();
    isExportingPdf.value = true;

    try {
        const { generateDebtSituationPdf } = await import('@/services/reports/generateDebtSituationPdf');
        await generateDebtSituationPdf(buildCurrentDebtReport());
        message.value = 'Exportação em PDF iniciada com sucesso.';
    } catch {
        error.value = 'Não foi possível exportar o PDF das dívidas.';
    } finally {
        isExportingPdf.value = false;
    }
};

const exportToExcel = async () => {
    if (isExportingExcel.value) return;

    message.value = '';
    error.value = '';
    closeExportMenu();
    isExportingExcel.value = true;

    try {
        const { generateDebtSituationExcel } = await import('@/services/reports/generateDebtSituationExcel');
        await generateDebtSituationExcel(buildCurrentDebtReport());
        message.value = 'Exportação em Excel iniciada com sucesso.';
    } catch {
        error.value = 'Não foi possível exportar o Excel das dívidas.';
    } finally {
        isExportingExcel.value = false;
    }
};

const closeFormModal = () => {
    isFormOpen.value = false;
    resetForm();
};

const populateForm = (debt) => {
    editingId.value = debt.id;
    form.description = debt.description || '';
    form.total_amount = debt.total_amount ?? '';
    form.paid_amount = debt.paid_amount ?? '';
    form.due_date = toDateInputValue(debt.due_date) || today;
    form.status = debt.status || 'pendente';
    form.notes = debt.notes || '';
    form.installments = '';
    form.notify = true;
    formError.value = '';
};

const openCreateModal = () => {
    closeExportMenu();
    resetForm();
    isFormOpen.value = true;
};

const openViewModal = (debt) => {
    closeExportMenu();
    populateForm(debt);
    formMode.value = 'view';
    isFormOpen.value = true;
};

const editDebt = (debt) => {
    closeExportMenu();
    populateForm(debt);
    formMode.value = 'edit';
    isFormOpen.value = true;
};

const promoteToEdit = () => {
    if (!editingId.value) return;
    formMode.value = 'edit';
};

const askDeleteDebt = (debt) => {
    debtPendingDelete.value = debt;
};

const closeDeleteModal = () => {
    if (deleting.value) return;
    debtPendingDelete.value = null;
};

const loadDebts = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/debts', {
            params: {
                status: filters.status || undefined,
            },
        });

        debts.value = data.data;
        totals.value = data.meta;
    } catch {
        error.value = 'Falha ao carregar dívidas.';
    } finally {
        loading.value = false;
    }
};

const validateForm = () => {
    const total = Number(form.total_amount);
    const paid = Number(form.paid_amount || 0);

    if (!String(form.description).trim()) {
        formError.value = 'Informe a descrição da dívida.';
        return false;
    }

    if (total <= 0) {
        formError.value = 'O valor total precisa ser maior que zero.';
        return false;
    }

    if (paid < 0) {
        formError.value = 'O valor pago não pode ser negativo.';
        return false;
    }

    if (paid > total) {
        formError.value = 'O valor pago não pode ser maior que o valor total.';
        return false;
    }

    if (!form.due_date) {
        formError.value = 'Informe a data de vencimento.';
        return false;
    }

    formError.value = '';
    return true;
};

const saveDebt = async () => {
    if (isReadonly.value) return;

    message.value = '';
    error.value = '';

    if (!validateForm()) return;

    saving.value = true;

    const payload = {
        description: String(form.description).trim(),
        total_amount: Number(form.total_amount),
        paid_amount: Number(form.paid_amount || 0),
        due_date: form.due_date,
        status: resolveFormStatus(),
        notes: String(form.notes || '').trim() || null,
    };

    try {
        if (editingId.value) {
            await api.put(`/debts/${editingId.value}`, payload);
            message.value = 'Dívida atualizada com sucesso.';
        } else {
            await api.post('/debts', payload);
            message.value = 'Dívida cadastrada com sucesso.';
        }

        closeFormModal();
        await loadDebts();
    } catch (requestError) {
        formError.value = requestError?.response?.data?.message || 'Não foi possível salvar a dívida.';
    } finally {
        saving.value = false;
    }
};

const confirmDeleteDebt = async () => {
    if (!debtPendingDelete.value) return;

    deleting.value = true;
    message.value = '';
    error.value = '';

    try {
        await api.delete(`/debts/${debtPendingDelete.value.id}`);
        debtPendingDelete.value = null;
        message.value = 'Dívida removida com sucesso.';
        await loadDebts();
    } catch {
        error.value = 'Não foi possível remover a dívida.';
    } finally {
        deleting.value = false;
    }
};

const handleDocumentClick = (event) => {
    if (!isExportMenuOpen.value) return;

    const target = event.target;
    if (exportMenuRef.value?.contains(target)) return;

    closeExportMenu();
};

const handleDocumentKeydown = (event) => {
    if (event.key === 'Escape' && isExportMenuOpen.value) {
        closeExportMenu();
    }
};

onMounted(() => {
    loadDebts();
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<template>
    <section class="page debts-page">
        <header class="debts-header">
            <div class="debts-header-copy">
                <h2>Controle de Dívidas</h2>
                <p>Monitorize o seu progresso de quitação e planeie a sua liberdade financeira.</p>
            </div>

            <div class="debts-header-actions">
                <div ref="exportMenuRef" class="export-menu">
                    <button
                        class="btn-ghost incomes-export-trigger debts-export-trigger"
                        type="button"
                        :disabled="loading || isExportingPdf || isExportingExcel"
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
                        class="export-menu-panel debts-export-menu-panel"
                        role="menu"
                        aria-label="Opções de exportação"
                    >
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
                                            ? 'Montando o relatório visual da situação de débitos.'
                                            : 'Layout pronto para impressão e compartilhamento.'
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
                                            ? 'Montando a planilha detalhada da posição das dívidas.'
                                            : 'Planilha .xlsx com contratos, progresso e totais.'
                                    }}
                                </small>
                            </span>
                        </button>
                    </div>
                </div>

                <button class="btn-primary debts-header-action" type="button" @click="openCreateModal">
                    <span class="debts-header-action-icon">
                        <AppIcon name="plus" :size="18" />
                    </span>
                    <span>Nova Dívida</span>
                </button>
            </div>
        </header>

        <section class="cards-grid debts-summary-grid">
            <article class="metric-card debt-summary-card">
                <div class="debt-summary-head">
                    <span class="debt-summary-kicker">Dívida Total</span>
                    <span class="debt-summary-icon">
                        <AppIcon name="calculator" :size="18" />
                    </span>
                </div>

                <strong class="debt-summary-value">{{ formatCurrency(totals.total_amount) }}</strong>
                <p class="metric-description">{{ totalContractsLabel }}</p>
            </article>

            <article class="metric-card debt-summary-card">
                <div class="debt-summary-head">
                    <span class="debt-summary-kicker">Total Pago</span>
                    <span class="debt-summary-icon is-positive">
                        <AppIcon name="check" :size="18" />
                    </span>
                </div>

                <strong class="debt-summary-value is-positive">{{ formatCurrency(totals.paid_amount) }}</strong>
                <p class="metric-description">{{ paidRatioLabel }}</p>
            </article>

            <article class="metric-card debt-summary-card">
                <div class="debt-summary-head">
                    <span class="debt-summary-kicker">Restante</span>
                    <span class="debt-summary-icon is-warning">
                        <AppIcon name="clock" :size="18" />
                    </span>
                </div>

                <strong class="debt-summary-value is-warning">{{ formatCurrency(totals.remaining_amount) }}</strong>
                <p class="metric-description">{{ remainingDescription }}</p>
            </article>

            <article class="metric-card debt-progress-card">
                <div class="debt-progress-copy">
                    <span class="debt-summary-kicker">Quitação Geral</span>

                    <div class="debt-progress-value-line">
                        <strong class="debt-summary-value">{{ completionDisplay }}%</strong>
                        <span class="debt-progress-caption">{{ completionTagline }}</span>
                    </div>
                </div>

                <div class="debt-progress-track">
                    <span :style="{ width: `${completionDisplay}%` }" />
                </div>

                <span class="debt-progress-decoration" aria-hidden="true">
                    <AppIcon name="sparkles" :size="108" />
                </span>
            </article>
        </section>

        <section class="panel debts-workspace">
            <div class="debts-toolbar">
                <div class="debts-search">
                    <div class="debt-search-field">
                        <AppIcon name="search" :size="18" />
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Procurar dívida ou credor..."
                            aria-label="Procurar dívida ou credor"
                        />
                    </div>
                </div>

                <div class="debts-toolbar-actions">
                    <label class="debts-select-field">
                        <select v-model="filters.status" aria-label="Filtrar por status">
                            <option value="">Todos os Status</option>
                            <option v-for="status in statuses" :key="status" :value="status">
                                {{ statusLabel(status) }}
                            </option>
                        </select>
                        <AppIcon name="chevronDown" :size="16" />
                    </label>

                    <button class="btn-ghost debts-filter-btn" type="button" @click="loadDebts" :disabled="loading">
                        <AppIcon name="filter" :size="16" />
                        <span>{{ filterButtonLabel }}</span>
                    </button>
                </div>
            </div>

            <div v-if="message || error" class="debt-feedback-stack">
                <p v-if="message" class="debt-feedback debt-feedback-success">{{ message }}</p>
                <p v-if="error" class="debt-feedback debt-feedback-error">{{ error }}</p>
            </div>

            <div v-if="filteredDebts.length" class="table-wrap debts-table-wrap">
                <table class="debts-table">
                    <thead>
                        <tr>
                            <th class="debt-col-description">Descrição / Credor</th>
                            <th class="debt-col-total align-right">Total</th>
                            <th class="debt-col-paid align-right">Pago</th>
                            <th class="debt-col-remaining align-right">Restante</th>
                            <th class="debt-col-progress">Progresso</th>
                            <th class="debt-col-due">Próximo Venc.</th>
                            <th class="debt-col-actions align-center">Ações</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr v-for="debt in filteredDebts" :key="debt.id">
                            <td class="debt-col-description">
                                <div class="debt-description-stack">
                                    <strong>{{ debt.description }}</strong>
                                    <small>{{ debtMetaLabel(debt) }}</small>
                                </div>
                            </td>

                            <td class="align-right">
                                <span class="debt-money">{{ formatCurrency(debt.total_amount) }}</span>
                            </td>

                            <td class="align-right">
                                <span class="debt-money is-positive">{{ formatCurrency(debt.paid_amount) }}</span>
                            </td>

                            <td class="align-right">
                                <span class="debt-money is-remaining">{{ formatCurrency(debt.remaining_amount) }}</span>
                            </td>

                            <td class="debt-col-progress">
                                <div class="debt-row-progress">
                                    <div class="debt-row-progress-track">
                                        <span :style="{ width: `${debtProgress(debt)}%` }" />
                                    </div>
                                    <small>{{ debtProgress(debt) }}% concluído</small>
                                </div>
                            </td>

                            <td class="debt-col-due">
                                <div class="debt-due-stack">
                                    <span>{{ formatDate(debt.due_date) }}</span>
                                    <small class="debt-due-hint" :class="dueToneClass(debt)">{{ dueHint(debt) }}</small>
                                </div>
                            </td>

                            <td class="debt-col-actions align-center actions-cell">
                                <div class="actions-cell-inner icon-actions debt-row-actions">
                                    <button
                                        class="btn-icon btn-icon-ghost debt-action-btn"
                                        type="button"
                                        :aria-label="`Visualizar ${debt.description}`"
                                        @click="openViewModal(debt)"
                                    >
                                        <AppIcon name="eye" :size="16" />
                                    </button>

                                    <button
                                        class="btn-icon btn-edit debt-action-btn"
                                        type="button"
                                        :aria-label="`Editar ${debt.description}`"
                                        @click="editDebt(debt)"
                                    >
                                        <AppIcon name="edit" :size="16" />
                                    </button>

                                    <button
                                        class="btn-icon btn-delete debt-action-btn"
                                        type="button"
                                        :aria-label="`Excluir ${debt.description}`"
                                        @click="askDeleteDebt(debt)"
                                    >
                                        <AppIcon name="delete" :size="16" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-else class="debt-empty-state">
                <div class="debt-empty-illustration">
                    <AppIcon :name="loading ? 'refresh' : 'debts'" :size="24" />
                </div>

                <h3>{{ loading ? 'Carregando dívidas...' : 'Nenhuma dívida encontrada' }}</h3>
                <p>
                    {{
                        loading
                            ? 'Estamos a reunir o seu painel de quitação.'
                            : 'Adicione uma nova dívida ou ajuste os filtros para continuar.'
                    }}
                </p>

                <button v-if="!loading" class="btn-primary debts-empty-action" type="button" @click="openCreateModal">
                    <AppIcon name="plus" :size="16" />
                    <span>Nova Dívida</span>
                </button>
            </div>
        </section>

        <Transition name="modal-fade">
            <div v-if="isFormOpen" class="modal-backdrop debts-modal-backdrop" @click.self="closeFormModal">
                <section class="modal-panel debt-form-modal" role="dialog" aria-modal="true" aria-labelledby="debt-form-title">
                    <header class="debt-form-header">
                        <div class="debt-form-copy">
                            <span class="debt-form-kicker">
                                {{ isReadonly ? 'Consulta' : editingId ? 'Atualização' : 'Planeamento' }}
                            </span>
                            <h3 id="debt-form-title">{{ modalTitle }}</h3>
                            <p>{{ modalDescription }}</p>
                        </div>

                        <button class="debt-form-close" type="button" @click="closeFormModal" :disabled="saving">
                            <AppIcon name="close" :size="22" />
                        </button>
                    </header>

                    <form class="debt-form-grid" @submit.prevent="saveDebt">
                        <label class="debt-field debt-field-full">
                            <span>Descrição / Credor *</span>
                            <input
                                v-model="form.description"
                                type="text"
                                :disabled="isReadonly || saving"
                                placeholder="Ex: Empréstimo Santander, financiamento do carro"
                                required
                            />
                        </label>

                        <label class="debt-field">
                            <span>Montante Total (R$) *</span>
                            <input
                                v-model="form.total_amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                :disabled="isReadonly || saving"
                                placeholder="0,00"
                                required
                            />
                        </label>

                        <label class="debt-field">
                            <span>Valor Já Pago (R$)</span>
                            <input
                                v-model="form.paid_amount"
                                type="number"
                                step="0.01"
                                min="0"
                                :disabled="isReadonly || saving"
                                placeholder="0,00"
                            />
                        </label>

                        <label class="debt-field">
                            <span>Próximo Vencimento *</span>
                            <input v-model="form.due_date" type="date" :disabled="isReadonly || saving" required />
                        </label>

                        <label class="debt-field">
                            <span>Nº de Parcelas</span>
                            <div class="debt-inline-field">
                                <input
                                    v-model="form.installments"
                                    type="number"
                                    min="1"
                                    :disabled="isReadonly || saving"
                                    placeholder="12"
                                />
                                <small>Opcional para o seu planeamento.</small>
                            </div>
                        </label>

                        <label class="debt-field debt-field-full">
                            <span>Observações</span>
                            <textarea
                                v-model="form.notes"
                                rows="3"
                                :disabled="isReadonly || saving"
                                placeholder="Detalhes úteis para o acompanhamento desta dívida."
                            />
                        </label>

                        <div class="debt-toggle-card debt-field-full">
                            <div class="debt-toggle-copy">
                                <div class="debt-toggle-icon">
                                    <AppIcon name="bell" :size="20" />
                                </div>

                                <div>
                                    <strong>Lembrete de Vencimento</strong>
                                    <p>Notificar 3 dias antes do próximo pagamento.</p>
                                </div>
                            </div>

                            <button
                                class="debt-toggle"
                                :class="{ 'is-active': form.notify }"
                                type="button"
                                :disabled="isReadonly || saving"
                                @click="form.notify = !form.notify"
                            >
                                <span />
                            </button>
                        </div>

                        <p v-if="formError" class="error-text debt-form-error debt-field-full">{{ formError }}</p>

                        <div class="debt-form-actions debt-field-full">
                            <template v-if="isReadonly">
                                <button class="btn-ghost debt-secondary-action" type="button" @click="closeFormModal">
                                    Fechar
                                </button>
                                <button class="btn-primary debt-submit-action" type="button" @click="promoteToEdit">
                                    <span>Editar Dívida</span>
                                    <AppIcon name="arrowRight" :size="16" />
                                </button>
                            </template>

                            <template v-else>
                                <button class="btn-ghost debt-secondary-action" type="button" @click="closeFormModal">
                                    Cancelar
                                </button>

                                <button class="btn-primary debt-submit-action" type="submit" :disabled="saving">
                                    <span>{{ saving ? 'Salvando...' : submitLabel }}</span>
                                    <AppIcon name="arrowRight" :size="16" />
                                </button>
                            </template>
                        </div>
                    </form>
                </section>
            </div>
        </Transition>

        <ConfirmDeleteModal
            :open="Boolean(debtPendingDelete)"
            entity-label="dívida"
            :item-name="debtPendingDelete?.description || ''"
            confirm-label="Excluir dívida"
            :loading="deleting"
            @close="closeDeleteModal"
            @confirm="confirmDeleteDebt"
        />
    </section>
</template>
