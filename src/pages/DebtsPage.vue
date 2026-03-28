<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '@/services/api';
import { formatCurrency, formatDate, toDateInputValue } from '@/utils/formatters';

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

const debts = ref([]);
const totals = ref({
    total_amount: 0,
    paid_amount: 0,
    remaining_amount: 0,
});
const message = ref('');
const error = ref('');
const editingId = ref(null);
const loading = ref(false);

const resetForm = () => {
    form.description = '';
    form.total_amount = '';
    form.paid_amount = 0;
    form.due_date = today;
    form.status = 'pendente';
    form.notes = '';
    editingId.value = null;
};

const loadDebts = async () => {
    loading.value = true;
    error.value = '';

    try {
        const { data } = await api.get('/debts');
        debts.value = data.data;
        totals.value = data.meta;
    } catch {
        error.value = 'Falha ao carregar dívidas.';
    } finally {
        loading.value = false;
    }
};

const saveDebt = async () => {
    message.value = '';
    error.value = '';

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
};

const removeDebt = async (debt) => {
    const confirmed = window.confirm(`Remover a dívida "${debt.description}"?`);
    if (!confirmed) {
        return;
    }

    await api.delete(`/debts/${debt.id}`);
    await loadDebts();
};

onMounted(loadDebts);
</script>

<template>
    <section class="page">
        <header class="page-header">
            <div>
                <h2>Controle de Dívidas</h2>
                <p>Monitore valor total, pago, restante e vencimentos.</p>
            </div>
            <button class="btn-primary" type="button" @click="loadDebts" :disabled="loading">
                Atualizar
            </button>
        </header>

        <div class="cards-grid">
            <article class="metric-card">
                <h3>Total de dívidas</h3>
                <strong>{{ formatCurrency(totals.total_amount) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Total pago</h3>
                <strong>{{ formatCurrency(totals.paid_amount) }}</strong>
            </article>
            <article class="metric-card">
                <h3>Total restante</h3>
                <strong>{{ formatCurrency(totals.remaining_amount) }}</strong>
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
                                {{ status }}
                            </option>
                        </select>
                    </label>
                    <label class="full">
                        Observações
                        <textarea v-model="form.notes" rows="3" />
                    </label>
                    <div class="actions">
                        <button class="btn-primary" type="submit">
                            {{ editingId ? 'Atualizar' : 'Salvar' }}
                        </button>
                        <button class="btn-ghost" type="button" @click="resetForm">Limpar</button>
                    </div>
                </form>
            </article>

            <article class="panel">
                <h3>Lista de Dívidas</h3>
                <p v-if="message" class="success-text">{{ message }}</p>
                <p v-if="error" class="error-text">{{ error }}</p>

                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Descrição</th>
                                <th>Total</th>
                                <th>Pago</th>
                                <th>Restante</th>
                                <th>Vencimento</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="debt in debts" :key="debt.id">
                                <td>{{ debt.description }}</td>
                                <td>{{ formatCurrency(debt.total_amount) }}</td>
                                <td>{{ formatCurrency(debt.paid_amount) }}</td>
                                <td>{{ formatCurrency(debt.remaining_amount) }}</td>
                                <td>{{ formatDate(debt.due_date) }}</td>
                                <td>{{ debt.status }}</td>
                                <td class="row-actions">
                                    <button class="btn-link" @click="editDebt(debt)">Editar</button>
                                    <button class="btn-link danger" @click="removeDebt(debt)">Excluir</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>
        </div>
    </section>
</template>
