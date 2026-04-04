import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency } from '@/utils/formatters';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 52;
const FOOTER_HEIGHT = 44;

const COLORS = {
    ink: [15, 23, 42],
    muted: [148, 163, 184],
    line: [226, 232, 240],
    surface: [255, 255, 255],
    surfaceSoft: [248, 250, 252],
    balanceCard: [245, 247, 250],
    success: [5, 150, 105],
    successSoft: [236, 253, 245],
    danger: [225, 29, 72],
    warning: [217, 119, 6],
    indigo: [79, 70, 229],
    dark: [15, 23, 42],
    footer: [203, 213, 225],
};

const FOOTER_SYSTEM_LABEL = 'Financeiro Pro | Relatório mensal';
const NOTES_TEXT =
    'Este documento é para uso pessoal e conferência de fluxo de caixa. Os valores apresentados consideram apenas as transações do período selecionado.';

const setColor = (doc, color) => doc.setTextColor(color[0], color[1], color[2]);
const setDrawColor = (doc, color) => doc.setDrawColor(color[0], color[1], color[2]);
const setFillColor = (doc, color) => doc.setFillColor(color[0], color[1], color[2]);
const getAvailablePageBottom = () => PAGE_HEIGHT - FOOTER_HEIGHT - 16;

const formatPercent = (value) =>
    `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(Number(value || 0))}%`;

const formatPageNumber = (pageNumber) => String(pageNumber).padStart(2, '0');

const getGeneratedAtLabel = (value) => {
    const parsedDate = new Date(value);
    const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const datePart = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(safeDate);

    const timePart = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(safeDate);

    return `Gerado em: ${datePart} às ${timePart}`;
};

const getStatusColor = (entry) => {
    if (entry.status === 'PENDENTE') return COLORS.warning;
    if (entry.type === 'income') return COLORS.success;
    return COLORS.danger;
};

const getAmountColor = (entry) => (entry.type === 'income' ? COLORS.success : COLORS.danger);

const drawFittedText = (doc, { text, x, y, maxWidth, maxFontSize, minFontSize, color, align = 'left' }) => {
    let fontSize = maxFontSize;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    while (fontSize > minFontSize && doc.getTextWidth(text) > maxWidth) {
        fontSize -= 0.5;
        doc.setFontSize(fontSize);
    }

    setColor(doc, color);
    doc.text(text, x, y, { align });
};

const drawHeader = (doc, report) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    setColor(doc, COLORS.ink);
    doc.text('Financeiro Pro', MARGIN_X, 72);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Relatório Consolidado de Movimentações', MARGIN_X, 98);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, COLORS.muted);
    doc.text('PERÍODO', PAGE_WIDTH - MARGIN_X, 64, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    setColor(doc, COLORS.ink);
    doc.text(report.periodLabel, PAGE_WIDTH - MARGIN_X, 90, { align: 'right' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    setColor(doc, COLORS.muted);
    doc.text(getGeneratedAtLabel(report.generatedAt), PAGE_WIDTH - MARGIN_X, 112, { align: 'right' });

    setDrawColor(doc, COLORS.dark);
    doc.setLineWidth(1.5);
    doc.line(MARGIN_X, 138, PAGE_WIDTH - MARGIN_X, 138);
};

const drawSummaryCards = (doc, report) => {
    const cards = [
        { label: 'RECEITAS', value: formatCurrency(report.totals.income), color: COLORS.success, fill: COLORS.surface },
        { label: 'DESPESAS', value: formatCurrency(report.totals.expense), color: COLORS.danger, fill: COLORS.surface },
        { label: 'SALDO', value: formatCurrency(report.totals.balance), color: COLORS.ink, fill: COLORS.balanceCard },
        { label: 'ECONOMIA', value: formatPercent(report.totals.savingsPercent), color: COLORS.indigo, fill: COLORS.surface },
    ];

    const gap = 12;
    const cardWidth = (PAGE_WIDTH - MARGIN_X * 2 - gap * 3) / 4;
    const cardHeight = 72;
    const startY = 176;

    cards.forEach((card, index) => {
        const cardX = MARGIN_X + (cardWidth + gap) * index;
        const contentX = cardX + 14;
        const contentWidth = cardWidth - 28;

        setFillColor(doc, card.fill);
        setDrawColor(doc, COLORS.line);
        doc.roundedRect(cardX, startY, cardWidth, cardHeight, 6, 6, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(doc, COLORS.muted);
        doc.text(card.label, contentX, startY + 18);

        drawFittedText(doc, {
            text: card.value,
            x: contentX,
            y: startY + 43,
            maxWidth: contentWidth,
            maxFontSize: 14,
            minFontSize: 10,
            color: card.color,
        });
    });

    return startY + cardHeight;
};

const drawTableHeading = (doc, y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(doc, COLORS.muted);
    doc.text('DETALHAMENTO DAS ENTRADAS E SAÍDAS', MARGIN_X, y);
};

const drawClosingSection = (doc, report, finalTableY) => {
    const noteLines = doc.splitTextToSize(NOTES_TEXT, 290);
    const notesHeight = noteLines.length * 12;
    const requiredHeight = 42 + 28 + 20 + notesHeight + 18;
    let startY = finalTableY + 18;

    if (startY + requiredHeight > getAvailablePageBottom()) {
        doc.addPage();
        startY = 72;
    }

    const barHeight = 42;
    const barY = startY;
    const valueX = PAGE_WIDTH - MARGIN_X - 18;

    setFillColor(doc, COLORS.dark);
    doc.rect(MARGIN_X, barY, PAGE_WIDTH - MARGIN_X * 2, barHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, COLORS.surface);
    doc.text('SALDO FINAL DO RELATÓRIO', valueX - 96, barY + 27, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(formatCurrency(report.totals.balance), valueX, barY + 27, { align: 'right' });

    const notesY = barY + 82;
    setDrawColor(doc, COLORS.line);
    doc.setLineWidth(1);
    doc.line(MARGIN_X, notesY - 20, PAGE_WIDTH - MARGIN_X, notesY - 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(doc, COLORS.muted);
    doc.text('NOTAS FINAIS', MARGIN_X, notesY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(noteLines, MARGIN_X, notesY + 20, {
        baseline: 'top',
        maxWidth: 290,
    });
};

const drawPageFooters = (doc) => {
    const totalPages = doc.internal.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        doc.setPage(pageNumber);

        const footerY = PAGE_HEIGHT - 24;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(doc, COLORS.footer);
        doc.text(
            `Página ${formatPageNumber(pageNumber)} de ${formatPageNumber(totalPages)}`,
            PAGE_WIDTH - MARGIN_X,
            footerY - 14,
            { align: 'right' },
        );
        doc.text(FOOTER_SYSTEM_LABEL, PAGE_WIDTH - MARGIN_X, footerY, { align: 'right' });
    }
};

/**
 * @typedef {Object} ReportEntry
 * @property {string} date
 * @property {string} description
 * @property {string} category
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
 * @param {FinancialMonthReport} report
 * @returns {Promise<void>}
 */
export async function generateMonthlyFinancialPdf(report) {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
    });

    drawHeader(doc, report);
    const cardsBottomY = drawSummaryCards(doc, report);
    const tableTitleY = cardsBottomY + 58;
    drawTableHeading(doc, tableTitleY);

    const hasEntries = report.entries.length > 0;
    const bodyRows = hasEntries
        ? report.entries.map((entry) => [
              formatDate(entry.date),
              entry.description,
              entry.category,
              entry.status,
              formatCurrency(entry.amount),
          ])
        : [['-', 'Nenhuma movimentação encontrada no período selecionado.', '-', '-', '-']];

    autoTable(doc, {
        head: [['Data', 'Descrição', 'Categoria', 'Status', 'Valor']],
        body: bodyRows,
        startY: tableTitleY + 16,
        margin: {
            top: 96,
            right: MARGIN_X,
            bottom: FOOTER_HEIGHT + 18,
            left: MARGIN_X,
        },
        showHead: 'everyPage',
        theme: 'plain',
        styles: {
            font: 'helvetica',
            fontSize: 9.4,
            textColor: COLORS.ink,
            cellPadding: {
                top: 8,
                right: 8,
                bottom: 8,
                left: 8,
            },
            lineColor: COLORS.line,
            lineWidth: {
                bottom: 0.8,
            },
            valign: 'middle',
        },
        headStyles: {
            fillColor: COLORS.surfaceSoft,
            textColor: [71, 85, 105],
            fontStyle: 'bold',
            fontSize: 9.4,
            halign: 'left',
            cellPadding: {
                top: 10,
                right: 8,
                bottom: 10,
                left: 8,
            },
            lineColor: [203, 213, 225],
            lineWidth: {
                bottom: 1.2,
            },
        },
        columnStyles: {
            0: { cellWidth: 76 },
            1: { cellWidth: 161 },
            2: { cellWidth: 98 },
            3: { cellWidth: 72, halign: 'center' },
            4: { cellWidth: 84, halign: 'right' },
        },
        didParseCell: (hookData) => {
            if (hookData.section === 'head') {
                return;
            }

            if (!hasEntries) {
                if (hookData.column.index === 1) {
                    hookData.cell.styles.fontStyle = 'bold';
                    hookData.cell.styles.halign = 'left';
                }
                return;
            }

            const entry = report.entries[hookData.row.index];
            if (!entry) return;

            if (hookData.column.index === 0) {
                hookData.cell.styles.textColor = [30, 41, 59];
            }

            if (hookData.column.index === 1) {
                hookData.cell.styles.fontStyle = 'bold';
            }

            if (hookData.column.index === 2) {
                hookData.cell.styles.textColor = [71, 85, 105];
            }

            if (hookData.column.index === 3) {
                hookData.cell.styles.fontStyle = 'bold';
                hookData.cell.styles.fontSize = 8.4;
                hookData.cell.styles.cellPadding = {
                    top: 8,
                    right: 4,
                    bottom: 8,
                    left: 4,
                };
                hookData.cell.styles.textColor = getStatusColor(entry);
            }

            if (hookData.column.index === 4) {
                hookData.cell.styles.fontStyle = 'bold';
                hookData.cell.styles.fontSize = 9.2;
                hookData.cell.styles.textColor = getAmountColor(entry);
            }

            if (entry.type === 'income') {
                hookData.cell.styles.fillColor = COLORS.successSoft;
            }
        },
        didDrawPage: (hookData) => {
            if (hookData.pageNumber === 1) {
                return;
            }

            drawTableHeading(doc, 72);
        },
    });

    const finalTableY = doc.lastAutoTable?.finalY || tableTitleY + 30;
    drawClosingSection(doc, report, finalTableY);
    drawPageFooters(doc);

    doc.save(`financeiro-pro-${report.year}-${String(report.month).padStart(2, '0')}.pdf`);
}
