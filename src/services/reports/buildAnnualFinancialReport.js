import { monthName } from '@/utils/formatters';

const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundPercent = (value) => Math.round(Number(value || 0) * 10) / 10;

const capitalize = (value) => {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
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

const normalizeRow = (rawRow, month, accumulatedBalance) => {
    const incomeTotal = roundCurrency(rawRow?.income_total);
    const expenseTotal = roundCurrency(rawRow?.expense_total);
    const balance = roundCurrency(rawRow?.balance ?? incomeTotal - expenseTotal);
    const normalizedAccumulatedBalance = roundCurrency(
        rawRow?.accumulated_balance ?? accumulatedBalance + balance,
    );

    return {
        month,
        monthLabel: capitalize(monthName(month)),
        income_total: incomeTotal,
        expense_total: expenseTotal,
        balance,
        accumulated_balance: normalizedAccumulatedBalance,
        statusLabel: balance >= 0 ? 'Positivo' : 'Défice',
        statusTone: balance >= 0 ? 'positive' : 'negative',
    };
};

const hasMovement = (row) =>
    Number(row.income_total || 0) !== 0 || Number(row.expense_total || 0) !== 0 || Number(row.balance || 0) !== 0;

/**
 * @typedef {Object} AnnualReportRow
 * @property {number} month
 * @property {string} monthLabel
 * @property {number} income_total
 * @property {number} expense_total
 * @property {number} balance
 * @property {number} accumulated_balance
 * @property {'Positivo' | 'Défice'} statusLabel
 * @property {'positive' | 'negative'} statusTone
 */

/**
 * @typedef {Object} AnnualFinancialReport
 * @property {number} year
 * @property {string} periodLabel
 * @property {string} generatedAt
 * @property {{
 *   income_total: number,
 *   expense_total: number,
 *   balance: number,
 *   savings_rate: number,
 *   positive_months: number
 * }} totals
 * @property {AnnualReportRow[]} rows
 * @property {AnnualReportRow | null} bestMonth
 * @property {AnnualReportRow | null} worstMonth
 */

/**
 * @param {{
 *   year: number,
 *   rows?: Array<Record<string, any>>,
 *   totals?: Record<string, any>,
 *   generatedAt?: string | Date
 * }} params
 * @returns {AnnualFinancialReport}
 */
export function buildAnnualFinancialReport({ year, rows = [], totals = {}, generatedAt = new Date() }) {
    const normalizedYear = Number(year);
    const rowsByMonth = new Map(rows.map((row) => [Number(row?.month), row]));

    let accumulatedBalance = 0;
    const normalizedRows = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const row = normalizeRow(rowsByMonth.get(month), month, accumulatedBalance);
        accumulatedBalance = row.accumulated_balance;
        return row;
    });

    const incomeTotal = roundCurrency(
        totals?.income_total ?? normalizedRows.reduce((sum, row) => sum + Number(row.income_total || 0), 0),
    );
    const expenseTotal = roundCurrency(
        totals?.expense_total ?? normalizedRows.reduce((sum, row) => sum + Number(row.expense_total || 0), 0),
    );
    const balance = roundCurrency(
        totals?.balance ?? normalizedRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    );
    const savingsRate = incomeTotal > 0 ? roundPercent((balance / incomeTotal) * 100) : 0;
    const positiveMonths = normalizedRows.filter((row) => Number(row.balance || 0) >= 0).length;
    const rowsWithMovement = normalizedRows.filter(hasMovement);

    const bestMonth = rowsWithMovement.length
        ? [...rowsWithMovement].sort((left, right) => Number(right.balance || 0) - Number(left.balance || 0))[0]
        : null;
    const worstMonth = rowsWithMovement.length
        ? [...rowsWithMovement].sort((left, right) => Number(left.balance || 0) - Number(right.balance || 0))[0]
        : null;

    return {
        year: normalizedYear,
        periodLabel: `Exercício ${normalizedYear}`,
        generatedAt: normalizeGeneratedAt(generatedAt),
        totals: {
            income_total: incomeTotal,
            expense_total: expenseTotal,
            balance,
            savings_rate: savingsRate,
            positive_months: positiveMonths,
        },
        rows: normalizedRows,
        bestMonth,
        worstMonth,
    };
}
