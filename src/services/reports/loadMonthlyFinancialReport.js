import api from '@/services/api';
import { buildMonthlyFinancialReport } from '@/services/reports/buildMonthlyFinancialReport';

const toResponseList = (response) => (Array.isArray(response?.data?.data) ? response.data.data : []);

/**
 * @param {{ month: number, year: number, generatedAt?: string | Date }} params
 * @returns {Promise<ReturnType<typeof buildMonthlyFinancialReport>>}
 */
export async function loadMonthlyFinancialReport({ month, year, generatedAt = new Date() }) {
    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);

    const [incomesResponse, expensesResponse] = await Promise.all([
        api.get('/incomes', {
            params: {
                month: normalizedMonth,
                year: normalizedYear,
            },
        }),
        api.get('/expenses', {
            params: {
                month: normalizedMonth,
                year: normalizedYear,
            },
        }),
    ]);

    return buildMonthlyFinancialReport({
        month: normalizedMonth,
        year: normalizedYear,
        incomes: toResponseList(incomesResponse),
        expenses: toResponseList(expensesResponse),
        generatedAt,
    });
}
