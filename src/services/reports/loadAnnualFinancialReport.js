import api from '@/services/api';
import { buildAnnualFinancialReport } from '@/services/reports/buildAnnualFinancialReport';

/**
 * @param {{ year: number, generatedAt?: string | Date }} params
 * @returns {Promise<ReturnType<typeof buildAnnualFinancialReport>>}
 */
export async function loadAnnualFinancialReport({ year, generatedAt = new Date() }) {
    const normalizedYear = Number(year);

    const response = await api.get('/reports/annual', {
        params: {
            year: normalizedYear,
        },
    });

    return buildAnnualFinancialReport({
        year: Number(response?.data?.year ?? normalizedYear),
        rows: Array.isArray(response?.data?.rows) ? response.data.rows : [],
        totals: response?.data?.totals ?? {},
        generatedAt,
    });
}
