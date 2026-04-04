import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/utils/formatters';

const MARGIN_X = 62;
const FOOTER_HEIGHT = 56;

const COLORS = {
    brand: [67, 56, 202],
    brandSoft: [99, 102, 241],
    ink: [22, 43, 69],
    muted: [144, 163, 191],
    line: [226, 232, 240],
    surfaceSoft: [245, 247, 252],
    success: [5, 150, 105],
    danger: [239, 68, 68],
    warning: [79, 70, 229],
    overdueFill: [255, 244, 246],
    paidFill: [241, 253, 247],
    track: [231, 235, 244],
    footer: [202, 211, 225],
};

const NOTICE_TEXT =
    'Este relatório é uma ferramenta de apoio à decisão financeira. Verifique sempre os juros e encargos contratuais diretamente com o credor antes de realizar amortizações.';

const formatPercent = (value, digits = 1) =>
    `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(Number(value || 0))}%`;

const formatPageNumber = (value) => String(value).padStart(2, '0');

const setTextColor = (doc, color) => doc.setTextColor(color[0], color[1], color[2]);
const setFillColor = (doc, color) => doc.setFillColor(color[0], color[1], color[2]);
const setDrawColor = (doc, color) => doc.setDrawColor(color[0], color[1], color[2]);

const getPageWidth = (doc) => doc.internal.pageSize.getWidth();
const getPageHeight = (doc) => doc.internal.pageSize.getHeight();

const getRowFill = (entry) => {
    if (entry.tone === 'overdue') return COLORS.overdueFill;
    if (entry.tone === 'paid') return COLORS.paidFill;
    return null;
};

const getDueColors = (entry) => {
    if (entry.tone === 'overdue') {
        return {
            date: COLORS.danger,
            label: COLORS.danger,
        };
    }

    if (entry.tone === 'paid') {
        return {
            date: COLORS.success,
            label: COLORS.success,
        };
    }

    return {
        date: COLORS.ink,
        label: [99, 102, 241],
    };
};

const buildFilename = (report) => {
    const dateKey = String(report.generatedAt || '')
        .slice(0, 10)
        .replace(/-/g, '');

    return `financeiro-pro-dividas-${dateKey || 'posicao'}.pdf`;
};

const drawHeader = (doc, report) => {
    const pageWidth = getPageWidth(doc);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(31);
    setTextColor(doc, COLORS.brand);
    doc.text('FINANCEIRO PRO', MARGIN_X, 56);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setTextColor(doc, COLORS.muted);
    doc.text('RELATÓRIO DE SITUAÇÃO DE DÉBITOS', MARGIN_X, 82);

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(11);
    doc.text(`POSIÇÃO EM: ${report.positionDateLabel}`, pageWidth - MARGIN_X, 82, { align: 'right' });

    setDrawColor(doc, COLORS.brand);
    doc.setLineWidth(5);
    doc.line(MARGIN_X, 126, pageWidth - MARGIN_X, 126);
};

const drawSummaryCards = (doc, report) => {
    const pageWidth = getPageWidth(doc);
    const gap = 18;
    const availableWidth = pageWidth - MARGIN_X * 2;
    const cardWidth = (availableWidth - gap * 3) / 4;
    const cardHeight = 82;
    const startY = 176;

    const cards = [
        {
            label: 'DÍVIDA BRUTA',
            value: formatCurrency(report.totals.totalAmount),
            valueColor: COLORS.ink,
            borderColor: COLORS.line,
        },
        {
            label: 'TOTAL AMORTIZADO',
            value: formatCurrency(report.totals.paidAmount),
            valueColor: COLORS.success,
            borderColor: COLORS.line,
        },
        {
            label: 'SALDO DEVEDOR',
            value: formatCurrency(report.totals.remainingAmount),
            valueColor: COLORS.warning,
            borderColor: [199, 210, 254],
        },
        {
            label: 'QUITAÇÃO GERAL',
            value: formatPercent(report.totals.completionPercent, 1),
            valueColor: COLORS.ink,
            borderColor: COLORS.line,
        },
    ];

    cards.forEach((card, index) => {
        const x = MARGIN_X + (cardWidth + gap) * index;
        const contentX = x + 16;

        setFillColor(doc, [255, 255, 255]);
        setDrawColor(doc, card.borderColor);
        doc.setLineWidth(index === 2 ? 1.8 : 1.2);
        doc.roundedRect(x, startY, cardWidth, cardHeight, 10, 10, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        setTextColor(doc, COLORS.muted);
        doc.text(card.label, contentX, startY + 28);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        setTextColor(doc, card.valueColor);
        doc.text(card.value, contentX, startY + 63);
    });

    return startY + cardHeight;
};

const drawSectionHeading = (doc, y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setTextColor(doc, COLORS.muted);
    doc.text('LISTAGEM DE CONTRATOS E VENCIMENTOS', MARGIN_X, y);
};

const drawDescriptionCell = (doc, cell, entry) => {
    const x = cell.x + 14;
    const titleY = cell.y + 22;
    const subtitleY = cell.y + 42;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.8);
    setTextColor(doc, COLORS.ink);
    doc.text(entry.description, x, titleY, {
        maxWidth: cell.width - 24,
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    setTextColor(doc, COLORS.muted);
    doc.text(entry.secondaryLabel, x, subtitleY, {
        maxWidth: cell.width - 24,
    });
};

const drawFittedRightText = (doc, { text, x, y, maxWidth, color, maxFontSize = 10.8, minFontSize = 8.4 }) => {
    let fontSize = maxFontSize;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    while (fontSize > minFontSize && doc.getTextWidth(text) > maxWidth) {
        fontSize -= 0.2;
        doc.setFontSize(fontSize);
    }

    setTextColor(doc, color);
    doc.text(text, x, y, { align: 'right' });
};

const drawAmountCell = (doc, cell, amount, color) => {
    drawFittedRightText(doc, {
        text: formatCurrency(amount),
        x: cell.x + cell.width - 10,
        y: cell.y + cell.height / 2 + 5,
        maxWidth: cell.width - 18,
        color,
    });
};

const drawProgressCell = (doc, cell, entry) => {
    const percentTextY = cell.y + 18;
    const trackY = cell.y + 34;
    const trackX = cell.x + 18;
    const trackWidth = cell.width - 36;
    const trackHeight = 8;
    const fillWidth = (trackWidth * Number(entry.progressPercent || 0)) / 100;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setTextColor(doc, COLORS.ink);
    doc.text(`${entry.progressPercent}%`, cell.x + cell.width / 2, percentTextY, { align: 'center' });

    setFillColor(doc, COLORS.track);
    doc.roundedRect(trackX, trackY, trackWidth, trackHeight, 4, 4, 'F');

    setFillColor(doc, COLORS.warning);
    doc.roundedRect(trackX, trackY, Math.max(fillWidth, 0), trackHeight, 4, 4, 'F');
};

const drawDueCell = (doc, cell, entry) => {
    const colors = getDueColors(entry);
    const dateY = cell.y + 24;
    const labelY = cell.y + 43;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.6);
    setTextColor(doc, colors.date);
    doc.text(entry.dueDateLabel, cell.x + cell.width / 2, dateY, { align: 'center' });

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(8.6);
    setTextColor(doc, colors.label);
    doc.text(entry.dueHintLabel, cell.x + cell.width / 2, labelY, {
        align: 'center',
        maxWidth: cell.width - 16,
    });
};

const drawNoticeSection = (doc, finalTableY) => {
    const pageHeight = getPageHeight(doc);
    const requiredHeight = 90;
    let startY = Math.max(finalTableY + 34, pageHeight - 122);

    if (startY + requiredHeight > pageHeight - FOOTER_HEIGHT) {
        doc.addPage();
        startY = 74;
    }

    setDrawColor(doc, COLORS.line);
    doc.setLineWidth(1);
    doc.line(MARGIN_X, startY, getPageWidth(doc) - MARGIN_X, startY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setTextColor(doc, COLORS.muted);
    doc.text('AVISO IMPORTANTE', MARGIN_X, startY + 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    doc.text(NOTICE_TEXT, MARGIN_X, startY + 48, {
        maxWidth: 420,
    });
};

const drawPageFooters = (doc) => {
    const totalPages = doc.internal.getNumberOfPages();
    const footerY = getPageHeight(doc) - 28;
    const pageWidth = getPageWidth(doc);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        doc.setPage(pageNumber);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setTextColor(doc, COLORS.footer);
        doc.text('Financeiro Pro - Versão Sênior', pageWidth - MARGIN_X, footerY - 16, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`PÁGINA ${formatPageNumber(pageNumber)} DE ${formatPageNumber(totalPages)}`, pageWidth - MARGIN_X, footerY, {
            align: 'right',
        });
    }
};

/**
 * @param {{
 *   generatedAt: string,
 *   positionDateLabel: string,
 *   totals: { totalAmount: number, paidAmount: number, remainingAmount: number, completionPercent: number },
 *   entries: Array<{
 *     description: string,
 *     secondaryLabel: string,
 *     totalAmount: number,
 *     paidAmount: number,
 *     remainingAmount: number,
 *     progressPercent: number,
 *     dueDateLabel: string,
 *     dueHintLabel: string,
 *     tone: 'open' | 'overdue' | 'paid'
 *   }>
 * }} report
 * @returns {Promise<void>}
 */
export async function generateDebtSituationPdf(report) {
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4',
    });

    drawHeader(doc, report);
    const cardsBottomY = drawSummaryCards(doc, report);
    const sectionY = cardsBottomY + 56;
    drawSectionHeading(doc, sectionY);

    const hasEntries = report.entries.length > 0;
    const bodyRows = hasEntries
        ? report.entries.map((entry) => [
              '',
              '',
              '',
              '',
              '',
              '',
          ])
        : [['Nenhuma dívida encontrada para o relatório.', '-', '-', '-', '-', '-']];

    autoTable(doc, {
        head: [['CREDOR / DESCRIÇÃO', 'VLR. TOTAL', 'VLR. PAGO', 'RESTANTE', 'PROGRESSO', 'PRÓXIMO VENC.']],
        body: bodyRows,
        startY: sectionY + 18,
        margin: {
            left: MARGIN_X,
            right: MARGIN_X,
            bottom: FOOTER_HEIGHT + 18,
        },
        theme: 'plain',
        tableWidth: 'wrap',
        styles: {
            font: 'helvetica',
            fontSize: 10.4,
            textColor: COLORS.ink,
            cellPadding: {
                top: 12,
                right: 10,
                bottom: 12,
                left: 10,
            },
            lineColor: COLORS.line,
            lineWidth: {
                bottom: 0.8,
            },
            valign: 'middle',
        },
        headStyles: {
            fillColor: COLORS.surfaceSoft,
            textColor: [89, 112, 146],
            fontStyle: 'bold',
            fontSize: 10.4,
            minCellHeight: 40,
            halign: 'left',
            lineColor: [215, 224, 238],
            lineWidth: {
                bottom: 1.2,
            },
        },
        columnStyles: {
            0: { cellWidth: 200 },
            1: { cellWidth: 106, halign: 'right' },
            2: { cellWidth: 104, halign: 'right' },
            3: { cellWidth: 118, halign: 'right' },
            4: { cellWidth: 88, halign: 'center' },
            5: { cellWidth: 101, halign: 'center' },
        },
        didParseCell: (data) => {
            if (data.section === 'head') {
                if (data.column.index >= 1) {
                    data.cell.styles.halign = data.column.index >= 4 ? 'center' : 'right';
                }
                return;
            }

            if (!hasEntries || data.section !== 'body') {
                return;
            }

            const entry = report.entries[data.row.index];
            const rowFill = getRowFill(entry);

            data.cell.styles.minCellHeight = 66;
            if (rowFill) {
                data.cell.styles.fillColor = rowFill;
            }

            if (data.column.index === 1) {
                data.cell.text = [''];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = COLORS.ink;
            }

            if (data.column.index === 2) {
                data.cell.text = [''];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = COLORS.success;
            }

            if (data.column.index === 3) {
                data.cell.text = [''];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = COLORS.warning;
            }
        },
        didDrawCell: (data) => {
            if (!hasEntries || data.section !== 'body') {
                return;
            }

            const entry = report.entries[data.row.index];

            if (data.column.index === 0) {
                drawDescriptionCell(doc, data.cell, entry);
            }

            if (data.column.index === 1) {
                drawAmountCell(doc, data.cell, entry.totalAmount, COLORS.ink);
            }

            if (data.column.index === 2) {
                drawAmountCell(doc, data.cell, entry.paidAmount, COLORS.success);
            }

            if (data.column.index === 3) {
                drawAmountCell(doc, data.cell, entry.remainingAmount, COLORS.warning);
            }

            if (data.column.index === 4) {
                drawProgressCell(doc, data.cell, entry);
            }

            if (data.column.index === 5) {
                drawDueCell(doc, data.cell, entry);
            }
        },
    });

    drawNoticeSection(doc, doc.lastAutoTable?.finalY || sectionY + 18);
    drawPageFooters(doc);
    doc.save(buildFilename(report));
}
