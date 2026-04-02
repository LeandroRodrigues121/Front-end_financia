<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import AppIcon from '@/components/AppIcon.vue';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';
import { statusLabel, statusTone } from '@/utils/labels';

const today = new Date().toISOString().slice(0, 10);
const statuses = ['pendente', 'paga', 'atrasada'];

const form = reactive({
    description: '',
    total_amount: '',
    paid_amount: 0,
    due_date: today,
    status: 'pendente',
    notes: '',
});

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
const searchQuery = ref('');

const completionPercent = computed(() => {
    const total = Number(totals.value.total_amount || 0);
    const paid = Number(totals.value.paid_amount || 0);
    return total > 0 ? (paid / total) * 100 : 0;
});

const overdueCount = computed(() => debts.value.filter((debt) => debt.status === 'atrasada').length);

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

const debtProgress = (debt) => {
    const total = Number(debt.total_amount || 0);
    const paid = Number(debt.paid_amount || 0);
    if (total <= 0) return 0;
    return Math.min((paid / total) * 100, 100);
};

const dueHint = (debt) => {
    if (!debt?.due_date) return 'Sem vencimento';
    if (debt.status === 'paga') return 'Dívida quitada';

    const todayMidnight = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
    const due = new Date(`${String(debt.due_date).slice(0, 10)}T00:00:00`);
    const diffInDays = Math.ceil((due - todayMidnight) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) return `Vencida há ${Math.abs(diffInDays)} dia(s)`;
    if (diffInDays <= 7) return `Vence em ${diffInDays} dia(s)`;
    return `Vence em ${diffInDays} dias`;
};

const resetForm = () => {
    form.description = '';
    form.total_amount = '';
    form.paid_amount = 0;
    form.due_date = today;
    form.status = 'pendente';
    form.notes = '';
    formError.value = '';
    editingId.value = null;
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
    message.value = '';
    error.value = '';
    if (!validateForm()) return;

    const payload = {
        ...form,
        total_amount: Number(form.total_amount),
        paid_amount: Number(form.paid_amount || 0),
    };

    try {
        if (editingId.value) {
            await api.put(`/debts/${editingId.value}`, payload);
            message.value = 'Dívida atualizada com sucesso.';
        } else {
            await api.post('/debts', payload);
            message.value = 'Dívida cadastrada com sucesso.';
        }

        resetForm();
        await loadDebts();
    } catch (requestError) {
        error.value = requestError?.response?.data?.message || 'Não foi possível salvar a dívida.';
    }
};

const editDebt = (debt) => {
    editingId.value = debt.id;
    form.description = debt.description;
    form.total_amount = debt.total_amount;
    form.paid_amount = debt.paid_amount;
    form.due_date = toDateInputValue(debt.due_date);
    form.status = debt.status;
    form.notes = debt.notes || '';
    formError.value = '';
};

const removeDebt = async (debt) => {
    const confirmed = window.confirm(`Remover a dívida "${debt.description}"?`);
    if (!confirmed) return;

    message.value = '';
    error.value = '';

    try {
        await api.delete(`/debts/${debt.id}`);
        message.value = 'Dívida removida com sucesso.';
        await loadDebts();
    } catch {
        error.value = 'Não foi possível remover a dívida.';
    }
};

onMounted(loadDebts);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Dívidas</h2>
                <p>Monitore total, progresso de quitação e vencimentos mais próximos.</p>
            </div>
            <div class="filters">
                <label>
                    Status
                    <select v-model="filters.status">
                        <option value="">Todos</option>
                        <option v-for="status in statuses" :key="status" :value="status">
                            {{ statusLabel(status) }}
                        </option>
                    </select>
                </label>
                <button class="btn-primary" type="button" @click="loadDebts" :disabled="loading">
                    <AppIcon name="refresh" :size="15" />
                    <span>{{ loading ? 'Atualizando...' : 'Atualizar' }}</span>
                </button>
            </div>
        </header>

        <div class="cards-grid debt-summary-grid">
            <article class="metric-card">
                <div class="metric-head">
                    <span class="metric-icon"><AppIcon name="debts" :size="15" /></span>
                    <h3>Total de dívidas</h3>
                </div>
                <strong>{{ formatCurrency(totals.total_amount) }}</strong>
            </article>
            <article class="metric-card tone-positive">
                <div class="metric-head">
                    <span class="metric-icon"><AppIcon name="check" :size="15" /></span>
                    <h3>Total pago</h3>
                </div>
                <strong>{{ formatCurrency(totals.paid_amount) }}</strong>
            </article>
            <article class="metric-card tone-warning">
                <div class="metric-head">
                    <span class="metric-icon"><AppIcon name="alert" :size="15" /></span>
                    <h3>Total restante</h3>
                </div>
                <strong>{{ formatCurrency(totals.remaining_amount) }}</strong>
            </article>
            <article class="metric-card">
                <div class="metric-head">
                    <span class="metric-icon"><AppIcon name="progress" :size="15" /></span>
                    <h3>Quitação geral</h3>
                </div>
                <strong>{{ completionPercent.toFixed(1).replace('.', ',') }}%</strong>
                <div class="progress-track progress-track-compact">
                    <span :style="{ width: `${Math.min(completionPercent, 100)}%` }" />
                </div>
                <small>{{ overdueCount }} dívida(s) atrasada(s)</small>
            </article>
        </div>

        <div class="split-grid">
            <article class="panel">
                <h3>{{ editingId ? 'Editar Dívida' : 'Nova Dívida' }}</h3>
                <form class="form-grid" @submit.prevent="saveDebt">
                    <label>
                        Descrição
                        <input v-model="form.description" type="text" required />
                    </label>
                    <label>
                        Valor total
                        <input v-model="form.total_amount" type="number" step="0.01" min="0.01" required />
                    </label>
                    <label>
                        Valor pago
                        <input v-model="form.paid_amount" type="number" step="0.01" min="0" required />
                    </label>
                    <label>
                        Data de vencimento
                        <input v-model="form.due_date" type="date" required />
                    </label>
                    <label>
                        Status
                        <select v-model="form.status" required>
                            <option v-for="status in statuses" :key="status" :value="status">
                                {{ statusLabel(status) }}
                            </option>
                        </select>
                    </label>
                    <label class="full">
                        Observações
                        <textarea v-model="form.notes" rows="3" />
                    </label>
                    <p v-if="formError" class="error-text full">{{ formError }}</p>
                    <div class="actions">
                        <button class="btn-primary" type="submit">
                            <AppIcon :name="editingId ? 'edit' : 'plus'" :size="15" />
                            <span>{{ editingId ? 'Atualizar' : 'Salvar' }}</span>
                        </button>
                        <button class="btn-ghost" type="button" @click="resetForm">Limpar</button>
                    </div>
                </form>
            </article>

            <article class="panel">
                <div class="panel-title">
                    <h3>Lista de Dívidas</h3>
                    <label class="table-search">
                        Buscar
                        <div class="search-field">
                            <AppIcon name="search" :size="14" />
                            <input v-model="searchQuery" type="text" placeholder="Descrição, status ou vencimento..." />
                        </div>
                    </label>
                </div>

                <p v-if="message" class="success-text">{{ message }}</p>
                <p v-if="error" class="error-text">{{ error }}</p>

                <div class="table-wrap">
                    <table v-if="filteredDebts.length">
                        <thead>
                            <tr>
                                <th>Descrição</th>
                                <th>Total</th>
                                <th>Pago</th>
                                <th>Restante</th>
                                <th>Progresso</th>
                                <th>Vencimento</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="debt in filteredDebts" :key="debt.id">
                                <td>{{ debt.description }}</td>
                                <td>{{ formatCurrency(debt.total_amount) }}</td>
                                <td>{{ formatCurrency(debt.paid_amount) }}</td>
                                <td>{{ formatCurrency(debt.remaining_amount) }}</td>
                                <td>
                                    <div class="mini-progress">
                                        <div class="progress-track progress-track-compact">
                                            <span :style="{ width: `${debtProgress(debt)}%` }" />
                                        </div>
                                        <small>{{ debtProgress(debt).toFixed(0) }}%</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="debt-due-info">
                                        <span>{{ formatDate(debt.due_date) }}</span>
                                        <small>{{ dueHint(debt) }}</small>
                                    </div>
                                </td>
                                <td>
                                    <span class="status-pill" :class="`tone-${statusTone(debt.status)}`">
                                        {{ statusLabel(debt.status) }}
                                    </span>
                                </td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editDebt(debt)">
                                        <AppIcon name="edit" :size="14" />
                                        <span>Editar</span>
                                    </button>
                                    <button class="btn-link danger" @click="removeDebt(debt)">
                                        <AppIcon name="delete" :size="14" />
                                        <span>Excluir</span>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-else class="empty-state">
                        <AppIcon :name="loading ? 'refresh' : 'debts'" :size="19" />
                        <p v-if="loading">Carregando dívidas...</p>
                        <p v-else>Nenhuma dívida encontrada para os filtros atuais.</p>
                    </div>
                </div>
            </article>
        </div>
    </section>
</template>
