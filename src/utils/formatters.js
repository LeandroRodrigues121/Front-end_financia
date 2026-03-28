export const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number(value || 0));

export const formatDate = (value) => {
    if (!value) {
        return '-';
    }

    const raw = String(value);
    const parsedDate = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
        return raw;
    }

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(parsedDate);
};

export const monthName = (monthNumber) =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, monthNumber - 1, 1));

export const toDateInputValue = (value) => {
    if (!value) {
        return '';
    }

    return String(value).slice(0, 10);
};
