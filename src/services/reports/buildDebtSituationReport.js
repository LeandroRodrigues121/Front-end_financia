import { formatDate } from '@/utils/formatters';

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundPercent = (value, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round(Number(value || 0) * factor) / factor;
};

const normalizeGeneratedAt = (generatedAt) => {
    if (generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())) {
        return generatedAt.toISOString();
    }

    const parsedDate = new Date(generatedAt || Date.now());
    if (Number.isNaN(parsedDate.getTime())) {
        return new Date().toISOString();
    }

    return parsedDate.toISOString();
};

const toDateValue = (value) => {
    const isoDate = String(value || '').slice(0, 10);
    if (!isoDate) return Number.POSITIVE_INFINITY;

    const parsedDate = new Date(`${isoDate}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? Number.POSITIVE_INFINITY : parsedDate.getTime();
};

const startOfDate = (value) => {
    const parsedDate = new Date(value || Date.now());
    if (Number.isNaN(parsedDate.getTime())) {
        return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
    }

    return new Date(`${parsedDate.toISOString().slice(0, 10)}T00:00:00`);
};

const resolveRemainingAmount = (debt) => {
    if (debt?.remaining_amount !== undefined && debt?.remaining_amount !== null) {
        return roundCurrency(debt.remaining_amount);
    }

    const totalAmount = Number(debt?.total_amount || 0);
    const paidAmount = Number(debt?.paid_amount || 0);
    return roundCurrency(Math.max(totalAmount - paidAmount, 0));
};

const resolveDebtTone = (debt, referenceDate) => {
    if (debt?.status === 'paga') return 'paid';
    if (debt?.status === 'atrasada') return 'overdue';

    const dueDateValue = toDateValue(debt?.due_date);
    if (dueDateValue < referenceDate.getTime()) {
        return 'overdue';
    }

    return 'open';
};

const getSecondaryLabel = (debt, tone) => {
    const note = String(debt?.notes || '').trim();
    if (note) return note.toUpperCase();

    if (tone === 'paid') return 'CONTRATO ENCERRADO';
    if (tone === 'overdue') return 'ATENÇÃO / VENCIMENTO EM ATRASO';
    return 'CONTRATO ATIVO / ACOMPANHAMENTO';
};

const getDueHintLabel = (debt, tone, referenceDate) => {
    if (!debt?.due_date) return 'SEM VENCIMENTO';
    if (tone === 'paid') return 'QUITADA';
    if (tone !== 'overdue') return 'EM DIA';

    const dueDate = new Date(`${String(debt.due_date).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dueDate.getTime())) {
        return 'VENCIDA';
    }

    const diffInDays = Math.max(1, Math.ceil((referenceDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    return `VENCIDA HÁ ${diffInDays} DIA${diffInDays === 1 ? '' : 'S'}`;
};

const getStatusLabel = (tone) => {
    if (tone === 'paid') return 'QUITADA';
    if (tone === 'overdue') return 'VENCIDA / ATENÇÃO';
    return 'EM DIA';
};

const getProgress = (debt) => {
    const totalAmount = Number(debt?.total_amount || 0);
    const paidAmount = Number(debt?.paid_amount || 0);

    if (totalAmount <= 0) return 0;
    return Math.min(Math.round((paidAmount / totalAmount) * 100), 100);
};

/**
 * @typedef {Object} DebtSituationEntry
 * @property {number|string} id
 * @property {string} description
 * @property {string} secondaryLabel
 * @property {number} totalAmount
 * @property {number} paidAmount
 * @property {number} remainingAmount
 * @property {number} progressPercent
 * @property {number} progressRatio
 * @property {string} dueDate
 * @property {string} dueDateLabel
 * @property {string} dueHintLabel
 * @property {string} statusLabel
 * @property {'open'|'overdue'|'paid'} tone
 */

/**
 * @typedef {Object} DebtSituationReport
 * @property {string} generatedAt
 * @property {string} positionDateLabel
 * @property {{ totalAmount: number, paidAmount: number, remainingAmount: number, completionPercent: number }} totals
 * @property {DebtSituationEntry[]} entries
 */

/**
 * @param {{ debts?: Array<Record<string, any>>, generatedAt?: string | Date }} params
 * @returns {DebtSituationReport}
 */
export function buildDebtSituationReport({ debts = [], generatedAt = new Date() }) {
    const normalizedGeneratedAt = normalizeGeneratedAt(generatedAt);
    const referenceDate = startOfDate(normalizedGeneratedAt);

    const entries = debts.map((debt) => {
        const tone = resolveDebtTone(debt, referenceDate);
        const totalAmount = roundCurrency(debt.total_amount);
        const paidAmount = roundCurrency(debt.paid_amount);
        const remainingAmount = resolveRemainingAmount(debt);

        return {
            id: debt.id,
            description: String(debt.description || '').trim() || 'Contrato sem descrição',
            secondaryLabel: getSecondaryLabel(debt, tone),
            totalAmount,
            paidAmount,
            remainingAmount,
            progressPercent: getProgress(debt),
            progressRatio: getProgress(debt) / 100,
            dueDate: String(debt.due_date || '').slice(0, 10),
            dueDateLabel: debt?.due_date ? formatDate(debt.due_date) : '-',
            dueHintLabel: getDueHintLabel(debt, tone, referenceDate),
            statusLabel: getStatusLabel(tone),
            tone,
        };
    });

    const totalAmount = roundCurrency(entries.reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0));
    const paidAmount = roundCurrency(entries.reduce((sum, entry) => sum + Number(entry.paidAmount || 0), 0));
    const remainingAmount = roundCurrency(entries.reduce((sum, entry) => sum + Number(entry.remainingAmount || 0), 0));
    const completionPercent = totalAmount > 0 ? roundPercent((paidAmount / totalAmount) * 100, 1) : 0;

    return {
        generatedAt: normalizedGeneratedAt,
        positionDateLabel: formatDate(normalizedGeneratedAt),
        totals: {
            totalAmount,
            paidAmount,
            remainingAmount,
            completionPercent,
        },
        entries,
    };
}
