import { monthName } from '@/utils/formatters';
import { expenseCategoryLabel, humanizeLabel, incomeTypeLabel } from '@/utils/labels';

const INCOME_STATUS_MAP = {
    recebido: 'RECEBIDO',
    pendente: 'PENDENTE',
};

const EXPENSE_STATUS_MAP = {
    paga: 'PAGO',
    pendente: 'PENDENTE',
    atrasada: 'ATRASADA',
};

const ENTRY_TYPE_ORDER = {
    income: 0,
    expense: 1,
};

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundPercent = (value) => Math.round(Number(value || 0) * 10) / 10;

const capitalize = (value) => {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
};

const paymentMethodLabel = (value) => String(value || '').trim() || 'Não informado';
const toIsoDate = (value) => String(value || '').slice(0, 10);

const toDateValue = (value) => {
    const isoDate = toIsoDate(value);
    const parsedDate = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date(NaN);
    return Number.isNaN(parsedDate.getTime()) ? Number.POSITIVE_INFINITY : parsedDate.getTime();
};

const compareEntries = (leftEntry, rightEntry) => {
    const dateDelta = toDateValue(leftEntry.date) - toDateValue(rightEntry.date);
    if (dateDelta !== 0) return dateDelta;

    const typeDelta = ENTRY_TYPE_ORDER[leftEntry.type] - ENTRY_TYPE_ORDER[rightEntry.type];
    if (typeDelta !== 0) return typeDelta;

    return String(leftEntry.description || '').localeCompare(String(rightEntry.description || ''), 'pt-BR');
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

/**
 * @typedef {Object} ReportEntry
 * @property {string} date
 * @property {string} description
 * @property {string} category
 * @property {string} flowLabel
 * @property {string} accountMethod
 * @property {'RECEBIDO' | 'PAGO' | 'PENDENTE' | 'ATRASADA'} status
 * @property {number} amount
 * @property {'income' | 'expense'} type
 */

/**
 * @typedef {Object} FinancialMonthReport
 * @property {number} month
 * @property {number} year
 * @property {string} periodLabel
 * @property {string} generatedAt
 * @property {{ income: number, expense: number, balance: number, savingsPercent: number }} totals
 * @property {ReportEntry[]} entries
 */

/**
 * @param {{
 *   month: number,
 *   year: number,
 *   incomes?: Array<Record<string, any>>,
 *   expenses?: Array<Record<string, any>>,
 *   generatedAt?: string | Date
 * }} params
 * @returns {FinancialMonthReport}
 */
export function buildMonthlyFinancialReport({ month, year, incomes = [], expenses = [], generatedAt = new Date() }) {
    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);

    const mappedIncomes = incomes.map((income) => ({
        date: toIsoDate(income.date),
        description: String(income.description || '').trim() || 'Receita sem descrição',
        category: humanizeLabel(income.category),
        flowLabel: 'RECEITA',
        accountMethod: incomeTypeLabel(income.type),
        status: INCOME_STATUS_MAP[income.status] || 'PENDENTE',
        amount: roundCurrency(income.amount),
        type: 'income',
    }));

    const mappedExpenses = expenses.map((expense) => ({
        date: toIsoDate(expense.date),
        description: String(expense.description || '').trim() || 'Despesa sem descrição',
        category: expenseCategoryLabel(expense.category),
        flowLabel: 'DESPESA',
        accountMethod: paymentMethodLabel(expense.payment_method),
        status: EXPENSE_STATUS_MAP[expense.status] || 'PENDENTE',
        amount: roundCurrency(expense.amount),
        type: 'expense',
    }));

    const incomeTotal = roundCurrency(mappedIncomes.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const expenseTotal = roundCurrency(mappedExpenses.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const balance = roundCurrency(incomeTotal - expenseTotal);
    const savingsPercent = incomeTotal > 0 ? roundPercent((balance / incomeTotal) * 100) : 0;

    return {
        month: normalizedMonth,
        year: normalizedYear,
        periodLabel: `${capitalize(monthName(normalizedMonth))} / ${normalizedYear}`,
        generatedAt: normalizeGeneratedAt(generatedAt),
        totals: {
            income: incomeTotal,
            expense: expenseTotal,
            balance,
            savingsPercent,
        },
        entries: [...mappedIncomes, ...mappedExpenses].sort(compareEntries),
    };
}
