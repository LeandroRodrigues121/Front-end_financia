import { jsPDF } from 'jspdf';
import { formatCurrency } from '@/utils/formatters';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;

const COLORS = {
    ink: [22, 43, 69],
    muted: [143, 163, 191],
    line: [219, 228, 239],
    lineStrong: [28, 41, 61],
    surface: [255, 255, 255],
    surfaceSoft: [248, 250, 252],
    success: [0, 168, 107],
    successSoft: [236, 253, 245],
    successCircle: [193, 247, 223],
    danger: [255, 40, 72],
    dangerSoft: [255, 242, 244],
    dangerCircle: [255, 220, 226],
    accent: [84, 80, 231],
    accentSoft: [240, 242, 255],
    footer: [204, 214, 229],
    rowAlert: [255, 246, 247],
    rowClosing: [244, 247, 251],
};

const NOTES_TEXT =
    'Os dados acima refletem a consolidação de todas as transações efetuadas entre 01/01 e 31/12. A taxa de poupança é calculada sobre o saldo líquido anual dividido pela receita bruta acumulada.';

const setTextColor = (doc, color) => doc.setTextColor(color[0], color[1], color[2]);
const setDrawColor = (doc, color) => doc.setDrawColor(color[0], color[1], color[2]);
const setFillColor = (doc, color) => doc.setFillColor(color[0], color[1], color[2]);

const formatPercent = (value) =>
    `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(Number(value || 0))}%`;

const formatIssuedDate = (value) => {
    const parsedDate = new Date(value || Date.now());
    const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(safeDate);
};

const formatCurrencyNoBreak = (value) => formatCurrency(value).replace(/\u00a0/g, ' ');

const formatSignedCurrency = (value) => {
    const amount = Number(value || 0);
    const formatted = formatCurrencyNoBreak(Math.abs(amount));

    if (amount < 0) {
        return `-${formatted}`;
    }

    return formatted;
};

const formatMonthHeadline = (row, type) => {
    if (!row) return type === 'best' ? 'Melhor mês indisponível' : 'Mês de alerta indisponível';

    if (type === 'best') {
        return `Saldo positivo de ${formatCurrencyNoBreak(row.balance)}`;
    }

    return `Défice de ${formatSignedCurrency(row.balance)}`;
};

const buildFilename = (report) => `financeiro-pro-relatorio-anual-${report.year}.pdf`;

const drawFittedValue = (doc, { text, x, y, width, color, align = 'left', maxSize = 15, minSize = 9 }) => {
    let fontSize = maxSize;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    while (fontSize > minSize && doc.getTextWidth(text) > width) {
        fontSize -= 0.5;
        doc.setFontSize(fontSize);
    }

    setTextColor(doc, color);
    doc.text(text, x, y, { align });
};

const drawHeader = (doc, report) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(29);
    setTextColor(doc, COLORS.ink);
    doc.text('FINANCEIRO PRO', MARGIN_X, 54);

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(13);
    setTextColor(doc, COLORS.muted);
    doc.text('RELATÓRIO ANUAL DE DESEMPENHO', MARGIN_X, 80);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('EXERCÍCIO', PAGE_WIDTH - MARGIN_X, 36, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    setTextColor(doc, COLORS.ink);
    doc.text(String(report.year), PAGE_WIDTH - MARGIN_X, 74, { align: 'right' });

    setDrawColor(doc, COLORS.lineStrong);
    doc.setLineWidth(1.2);
    doc.line(MARGIN_X, 110, PAGE_WIDTH - MARGIN_X, 110);
};

const drawSummaryCards = (doc, report) => {
    const cards = [
        {
            label: 'RECEITA TOTAL',
            value: formatCurrencyNoBreak(report.totals.income_total),
            valueColor: COLORS.ink,
            fill: COLORS.surface,
        },
        {
            label: 'DESPESA TOTAL',
            value: formatCurrencyNoBreak(report.totals.expense_total),
            valueColor: COLORS.danger,
            fill: COLORS.surface,
        },
        {
            label: 'SALDO ACUMULADO',
            value: formatCurrencyNoBreak(report.totals.balance),
            valueColor: COLORS.success,
            fill: COLORS.surface,
        },
        {
            label: 'EFICIÊNCIA (TAXA)',
            value: formatPercent(report.totals.savings_rate),
            valueColor: COLORS.accent,
            fill: COLORS.accentSoft,
        },
    ];

    const gap = 12;
    const cardWidth = (PAGE_WIDTH - MARGIN_X * 2 - gap * 3) / 4;
    const cardHeight = 70;
    const startY = 136;

    cards.forEach((card, index) => {
        const x = MARGIN_X + index * (cardWidth + gap);
        const contentX = x + 12;

        setFillColor(doc, card.fill);
        setDrawColor(doc, COLORS.line);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, startY, cardWidth, cardHeight, 10, 10, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setTextColor(doc, COLORS.muted);
        doc.text(card.label, contentX, startY + 16);

        drawFittedValue(doc, {
            text: card.value,
            x: contentX,
            y: startY + 48,
            width: cardWidth - 24,
            color: card.valueColor,
            maxSize: 13.5,
            minSize: 9.5,
        });
    });
};

const drawHighlightCard = (doc, { x, y, width, height, fillColor, circleColor, accentColor, eyebrow, headline, icon }) => {
    setFillColor(doc, fillColor);
    setDrawColor(doc, fillColor);
    doc.roundedRect(x, y, width, height, 10, 10, 'FD');

    setFillColor(doc, circleColor);
    doc.circle(x + 24, y + height / 2, 14, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setTextColor(doc, accentColor);
    doc.text(icon, x + 24, y + height / 2 + 7, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, accentColor);
    doc.text(eyebrow, x + 52, y + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setTextColor(doc, COLORS.ink);
    doc.text(headline, x + 52, y + 48);
};

const drawHighlights = (doc, report) => {
    const gap = 18;
    const blockWidth = (PAGE_WIDTH - MARGIN_X * 2 - gap) / 2;
    const y = 226;

    drawHighlightCard(doc, {
        x: MARGIN_X,
        y,
        width: blockWidth,
        height: 66,
        fillColor: COLORS.successSoft,
        circleColor: COLORS.successCircle,
        accentColor: COLORS.success,
        eyebrow: `MELHOR MÊS: ${(report.bestMonth?.monthLabel || '-').toUpperCase()}`,
        headline: formatMonthHeadline(report.bestMonth, 'best'),
        icon: '+',
    });

    drawHighlightCard(doc, {
        x: MARGIN_X + blockWidth + gap,
        y,
        width: blockWidth,
        height: 66,
        fillColor: COLORS.dangerSoft,
        circleColor: COLORS.dangerCircle,
        accentColor: COLORS.danger,
        eyebrow: `MÊS DE ALERTA: ${(report.worstMonth?.monthLabel || '-').toUpperCase()}`,
        headline: formatMonthHeadline(report.worstMonth, 'alert'),
        icon: '!',
    });
};

const drawTable = (doc, report) => {
    const titleY = 344;
    const tableTopY = 372;
    const tableRightX = PAGE_WIDTH - MARGIN_X;
    const rowHeight = 28;
    const columns = [
        { key: 'month', label: 'MÊS DO ANO', x: MARGIN_X + 12, align: 'left' },
        { key: 'income_total', label: 'RECEITAS', x: 212, align: 'right' },
        { key: 'expense_total', label: 'DESPESAS', x: 302, align: 'right' },
        { key: 'balance', label: 'RESULTADO', x: 394, align: 'right' },
        { key: 'accumulated_balance', label: 'ACUMULADO', x: 468, align: 'right' },
        { key: 'status', label: 'STATUS', x: tableRightX - 10, align: 'right' },
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setTextColor(doc, COLORS.muted);
    doc.text('DEMONSTRATIVO DE RESULTADOS MÊS A MÊS', MARGIN_X, titleY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    columns.forEach((column) => {
        doc.text(column.label, column.x, tableTopY, {
            align: column.align === 'left' ? 'left' : 'right',
        });
    });

    setDrawColor(doc, COLORS.lineStrong);
    doc.setLineWidth(1.4);
    doc.line(MARGIN_X, tableTopY + 12, tableRightX, tableTopY + 12);

    report.rows.forEach((row, index) => {
        const rowTopY = tableTopY + 14 + index * rowHeight;
        const rowBottomY = rowTopY + rowHeight;
        const isNegative = Number(row.balance || 0) < 0;
        const isClosing = row.month === 12;

        if (isNegative) {
            setFillColor(doc, COLORS.rowAlert);
            doc.rect(MARGIN_X, rowTopY, tableRightX - MARGIN_X, rowHeight, 'F');
        }

        if (isClosing) {
            setFillColor(doc, COLORS.rowClosing);
            doc.rect(425, rowTopY, tableRightX - 425, rowHeight, 'F');
        }

        setDrawColor(doc, COLORS.line);
        doc.setLineWidth(0.6);
        doc.line(MARGIN_X, rowBottomY, tableRightX, rowBottomY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setTextColor(doc, COLORS.ink);
        doc.text(row.monthLabel, columns[0].x, rowTopY + 19);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.6);
        doc.text(formatCurrencyNoBreak(row.income_total), columns[1].x, rowTopY + 19, { align: 'right' });
        doc.text(formatCurrencyNoBreak(row.expense_total), columns[2].x, rowTopY + 19, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        setTextColor(doc, isNegative ? COLORS.danger : COLORS.success);
        doc.text(formatSignedCurrency(row.balance), columns[3].x, rowTopY + 19, { align: 'right' });

        setTextColor(doc, COLORS.ink);
        doc.setFont('helvetica', isClosing ? 'bold' : 'normal');
        doc.text(formatCurrencyNoBreak(row.accumulated_balance), columns[4].x, rowTopY + 19, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        setTextColor(doc, isNegative ? COLORS.danger : COLORS.success);
        doc.text(isClosing ? 'FECHAMENTO' : row.statusLabel.toUpperCase(), columns[5].x, rowTopY + 19, {
            align: 'right',
        });

        if (isClosing) {
            setDrawColor(doc, COLORS.lineStrong);
            doc.setLineWidth(1);
            doc.line(columns[4].x - 68, rowBottomY, columns[4].x - 10, rowBottomY);
        }
    });

    return tableTopY + 14 + report.rows.length * rowHeight;
};

const drawFooter = (doc, report, tableBottomY) => {
    const notesY = Math.max(tableBottomY + 46, 770);
    const noteLines = doc.splitTextToSize(NOTES_TEXT, 260);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, COLORS.muted);
    doc.text('NOTAS DE AUDITORIA', MARGIN_X, notesY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(noteLines, MARGIN_X, notesY + 14, {
        maxWidth: 260,
        baseline: 'top',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, COLORS.footer);
    doc.text('Financeiro Pro - Relatório Oficial', PAGE_WIDTH - MARGIN_X, notesY + 36, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setTextColor(doc, COLORS.muted);
    doc.text(`EMITIDO EM: ${formatIssuedDate(report.generatedAt)}`, PAGE_WIDTH - MARGIN_X, notesY + 56, {
        align: 'right',
    });
};

/**
 * @param {import('@/services/reports/buildAnnualFinancialReport').AnnualFinancialReport} report
 * @returns {Promise<void>}
 */
export async function generateAnnualFinancialPdf(report) {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
    });

    setFillColor(doc, COLORS.surface);
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');

    drawHeader(doc, report);
    drawSummaryCards(doc, report);
    drawHighlights(doc, report);
    const tableBottomY = drawTable(doc, report);
    drawFooter(doc, report, tableBottomY);

    doc.save(buildFilename(report));
}
