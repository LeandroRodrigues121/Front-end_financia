import { monthName } from '@/utils/formatters';

const expenseCategoryMap = {
    moradia: 'Moradia',
    alimentacao: 'Alimentação',
    transporte: 'Transporte',
    lazer: 'Lazer',
    saude: 'Saúde',
    educacao: 'Educação',
    contas_fixas: 'Contas fixas',
    outros: 'Outros',
};

const incomeTypeMap = {
    salario: 'Salário',
    renda_extra: 'Renda extra',
    rendimento_investimento: 'Rendimento de investimento',
    outros: 'Outros',
};

const statusMap = {
    paga: 'Paga',
    pendente: 'Pendente',
    atrasada: 'Atrasada',
};

export const humanizeLabel = (value) =>
    String(value || '')
        .replace(/_/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

export const expenseCategoryLabel = (value) => expenseCategoryMap[value] || humanizeLabel(value);

export const incomeTypeLabel = (value) => incomeTypeMap[value] || humanizeLabel(value);

export const statusLabel = (value) => statusMap[value] || humanizeLabel(value);

export const statusTone = (value) => {
    if (value === 'paga') return 'positive';
    if (value === 'atrasada') return 'danger';
    return 'warning';
};

export const monthOptions = [...Array(12)].map((_, index) => ({
    value: index + 1,
    label: monthName(index + 1),
}));

export const monthShortLabel = (monthValue) => {
    const month = monthOptions.find((item) => item.value === Number(monthValue));
    if (!month) return String(monthValue || '-');
    return month.label.slice(0, 3);
};
