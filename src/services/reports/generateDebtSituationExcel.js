import ExcelJS from 'exceljs';

const SHEET_NAME = 'Situação de Débitos';
const BRL_FORMAT = '"R$" #,##0.00';
const PERCENT_FORMAT = '0%';
const DATE_FORMAT = 'dd/mm/yyyy';

const COLORS = {
    brand: 'FF4F46E5',
    brandDark: 'FF253148',
    brandSoft: 'FFE9EBFF',
    progressBar: 'FFB7BCF5',
    progressTrack: 'FFE0E5EF',
    ink: 'FF1A2B45',
    line: 'FFD4DDE9',
    surface: 'FFFFFFFF',
    surfaceSoft: 'FFF5F7FB',
    success: 'FF00A86B',
    successSoft: 'FFDFF7EA',
    successBorder: 'FFB7E9CC',
    danger: 'FFFF2848',
    dangerSoft: 'FFFFE7EC',
    dangerBorder: 'FFF7C8D2',
    warning: 'FF3F46D8',
    warningSoft: 'FFF1F2FF',
    muted: 'FF60718E',
};

const parseEntryDate = (value) => {
    const isoDate = String(value || '').slice(0, 10);
    if (!isoDate) return null;

    const parsedDate = new Date(`${isoDate}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const buildFilename = (report) => {
    const dateKey = String(report.generatedAt || '')
        .slice(0, 10)
        .replace(/-/g, '');

    return `financeiro-pro-dividas-${dateKey || 'posicao'}.xlsx`;
};

const downloadWorkbook = async (workbook, filename) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const applyCellBorder = (cell, color = COLORS.line) => {
    cell.border = {
        top: { style: 'thin', color: { argb: color } },
        left: { style: 'thin', color: { argb: color } },
        bottom: { style: 'thin', color: { argb: color } },
        right: { style: 'thin', color: { argb: color } },
    };
};

const setSolidFill = (cell, color) => {
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
    };
};

const getStatusCellStyle = (entry) => {
    if (entry.tone === 'overdue') {
        return {
            fill: COLORS.dangerSoft,
            border: COLORS.dangerBorder,
            font: COLORS.danger,
        };
    }

    if (entry.tone === 'paid') {
        return {
            fill: COLORS.warningSoft,
            border: 'FFD8DAFF',
            font: COLORS.warning,
        };
    }

    return {
        fill: COLORS.successSoft,
        border: COLORS.successBorder,
        font: COLORS.success,
    };
};

const styleHeaderRow = (row) => {
    row.height = 38;
    row.font = {
        bold: true,
        color: { argb: COLORS.surface },
        name: 'Consolas',
        size: 11,
    };
    row.alignment = {
        vertical: 'middle',
        horizontal: 'center',
    };

    row.eachCell((cell, columnNumber) => {
        setSolidFill(cell, COLORS.brand);
        applyCellBorder(cell);

        if (columnNumber === 1) {
            cell.alignment = {
                vertical: 'middle',
                horizontal: 'left',
            };
        }
    });
};

const styleDataRow = (row, entry) => {
    const statusStyle = getStatusCellStyle(entry);

    row.height = 36;

    row.eachCell((cell) => {
        setSolidFill(cell, COLORS.surface);
        applyCellBorder(cell);
        cell.alignment = {
            vertical: 'middle',
        };
    });

    row.getCell(1).font = {
        bold: true,
        color: { argb: COLORS.ink },
        name: 'Consolas',
        size: 11.5,
    };
    row.getCell(1).alignment = {
        vertical: 'middle',
        horizontal: 'left',
    };

    [2, 3, 4].forEach((columnNumber) => {
        row.getCell(columnNumber).numFmt = BRL_FORMAT;
        row.getCell(columnNumber).alignment = {
            vertical: 'middle',
            horizontal: 'right',
        };
        row.getCell(columnNumber).font = {
            bold: true,
            color: {
                argb:
                    columnNumber === 2 ? COLORS.ink : columnNumber === 3 ? COLORS.success : COLORS.warning,
            },
            name: 'Consolas',
            size: 11.5,
        };
    });

    setSolidFill(row.getCell(4), COLORS.brandSoft);

    row.getCell(5).numFmt = PERCENT_FORMAT;
    row.getCell(5).alignment = {
        vertical: 'middle',
        horizontal: 'center',
    };
    row.getCell(5).font = {
        bold: true,
        color: { argb: COLORS.ink },
        name: 'Consolas',
        size: 10.5,
    };
    setSolidFill(row.getCell(5), COLORS.progressTrack);

    row.getCell(6).alignment = {
        vertical: 'middle',
        horizontal: 'center',
    };
    row.getCell(6).font = {
        bold: true,
        color: { argb: entry.tone === 'overdue' ? COLORS.danger : COLORS.ink },
        name: 'Consolas',
        size: 11.5,
    };

    row.getCell(7).alignment = {
        vertical: 'middle',
        horizontal: 'center',
    };
    row.getCell(7).font = {
        bold: true,
        color: { argb: statusStyle.font },
        name: 'Consolas',
        size: 10.5,
    };
    setSolidFill(row.getCell(7), statusStyle.fill);
    applyCellBorder(row.getCell(7), statusStyle.border);
};

const styleTotalsRow = (row) => {
    row.height = 38;

    for (let columnNumber = 1; columnNumber <= 7; columnNumber += 1) {
        const cell = row.getCell(columnNumber);
        setSolidFill(cell, COLORS.brandDark);
        applyCellBorder(cell, 'FFD8E0EC');
        cell.alignment = {
            vertical: 'middle',
            horizontal: columnNumber === 1 ? 'left' : 'center',
        };
        cell.font = {
            bold: true,
            color: { argb: COLORS.surface },
            name: 'Consolas',
            size: 11,
        };
    }

    row.getCell(2).numFmt = BRL_FORMAT;
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };

    row.getCell(3).numFmt = BRL_FORMAT;
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(3).font = {
        bold: true,
        color: { argb: COLORS.successSoft },
        name: 'Consolas',
        size: 11.5,
    };

    row.getCell(4).numFmt = BRL_FORMAT;
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(4).font = {
        bold: true,
        color: { argb: COLORS.surface },
        name: 'Consolas',
        size: 11.5,
    };
    setSolidFill(row.getCell(4), COLORS.brand);

    row.getCell(5).numFmt = PERCENT_FORMAT;
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell(6).value = '';
    row.getCell(7).value = '';
};

/**
 * @param {{
 *   generatedAt: string,
 *   totals: { totalAmount: number, paidAmount: number, remainingAmount: number, completionPercent: number },
 *   entries: Array<{
 *     description: string,
 *     totalAmount: number,
 *     paidAmount: number,
 *     remainingAmount: number,
 *     progressPercent: number,
 *     progressRatio: number,
 *     dueDate: string,
 *     statusLabel: string,
 *     tone: 'open' | 'overdue' | 'paid'
 *   }>
 * }} report
 * @returns {Promise<void>}
 */
export async function generateDebtSituationExcel(report) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Codex';
    workbook.lastModifiedBy = 'Codex';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(SHEET_NAME, {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.properties.defaultRowHeight = 30;
    sheet.columns = [
        { key: 'description', width: 34 },
        { key: 'totalAmount', width: 22 },
        { key: 'paidAmount', width: 22 },
        { key: 'remainingAmount', width: 22 },
        { key: 'progress', width: 17 },
        { key: 'dueDate', width: 20 },
        { key: 'status', width: 21 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.values = ['CREDOR / DESCRIÇÃO', 'VLR. CONTRATADO', 'VLR. PAGO', 'SALDO RESTANTE', 'PROGRESSO', 'VENCIMENTO', 'STATUS'];
    styleHeaderRow(headerRow);

    let rowIndex = 2;
    let lastDataRow = 1;

    if (report.entries.length) {
        report.entries.forEach((entry) => {
            const row = sheet.getRow(rowIndex);
            const dueDateValue = parseEntryDate(entry.dueDate);

            row.getCell(1).value = String(entry.description || '-').toUpperCase();
            row.getCell(2).value = Number(entry.totalAmount || 0);
            row.getCell(3).value = Number(entry.paidAmount || 0);
            row.getCell(4).value = Number(entry.remainingAmount || 0);
            row.getCell(5).value = Number(entry.progressRatio || 0);
            row.getCell(6).value = dueDateValue || entry.dueDate || '-';
            row.getCell(7).value = entry.statusLabel;

            if (dueDateValue) {
                row.getCell(6).numFmt = DATE_FORMAT;
            }

            styleDataRow(row, entry);
            lastDataRow = rowIndex;
            rowIndex += 1;
        });
    } else {
        sheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
        const cell = sheet.getCell(`A${rowIndex}`);
        cell.value = 'Nenhuma dívida encontrada para o relatório.';
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
        };
        cell.font = {
            italic: true,
            color: { argb: COLORS.muted },
        };
        setSolidFill(cell, COLORS.surfaceSoft);
        applyCellBorder(cell);
        sheet.getRow(rowIndex).height = 30;
        lastDataRow = rowIndex;
        rowIndex += 1;
    }

    rowIndex += 1;

    const totalsRow = sheet.getRow(rowIndex);
    totalsRow.getCell(1).value = 'TOTAIS CONSOLIDADOS';
    totalsRow.getCell(2).value = Number(report.totals.totalAmount || 0);
    totalsRow.getCell(3).value = Number(report.totals.paidAmount || 0);
    totalsRow.getCell(4).value = Number(report.totals.remainingAmount || 0);
    totalsRow.getCell(5).value = Number(report.totals.completionPercent || 0) / 100;
    styleTotalsRow(totalsRow);

    sheet.autoFilter = {
        from: 'A1',
        to: `G${Math.max(1, lastDataRow)}`,
    };

    if (report.entries.length) {
        sheet.addConditionalFormatting({
            ref: `E2:E${lastDataRow}`,
            rules: [
                {
                    type: 'dataBar',
                    priority: 1,
                    gradient: false,
                    showValue: true,
                    border: false,
                    axisPosition: 'none',
                    direction: 'leftToRight',
                    minLength: 0,
                    maxLength: 100,
                    cfvo: [
                        { type: 'num', value: 0 },
                        { type: 'num', value: 1 },
                    ],
                    color: { argb: COLORS.progressBar },
                },
            ],
        });
    }

    const filename = buildFilename(report);
    await downloadWorkbook(workbook, filename);
}
