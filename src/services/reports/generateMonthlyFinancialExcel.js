import ExcelJS from 'exceljs';

const SHEET_NAME = 'Extrato Mensal';
const BRL_FORMAT = '"R$" #,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';

const COLORS = {
    brand: 'FF16253B',
    ink: 'FF1F3B63',
    muted: 'FF64748B',
    line: 'FFD1D9E6',
    lineStrong: 'FFB8C2D1',
    surface: 'FFFFFFFF',
    surfaceSoft: 'FFF8FAFC',
    success: 'FF059669',
    successSoft: 'FFF0FDF4',
    danger: 'FFE11D48',
    dangerSoft: 'FFFFF1F2',
};

const formatGeneratedAt = (value) => {
    const parsedDate = new Date(value || Date.now());
    const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(safeDate);
};

const formatFilePeriod = (value) =>
    String(value || 'periodo')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const parseEntryDate = (value) => {
    const isoDate = String(value || '').slice(0, 10);
    if (!isoDate) return null;

    const parsedDate = new Date(`${isoDate}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
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

const applyTableBorder = (cell) => {
    cell.border = {
        top: { style: 'thin', color: { argb: COLORS.line } },
        left: { style: 'thin', color: { argb: COLORS.line } },
        bottom: { style: 'thin', color: { argb: COLORS.line } },
        right: { style: 'thin', color: { argb: COLORS.line } },
    };
};

const applySummaryBorder = (cell) => {
    cell.border = {
        top: { style: 'medium', color: { argb: COLORS.lineStrong } },
        left: { style: 'thin', color: { argb: COLORS.line } },
        bottom: { style: 'thin', color: { argb: COLORS.line } },
        right: { style: 'thin', color: { argb: COLORS.line } },
    };
};

const applyBalanceBorder = (cell) => {
    cell.border = {
        top: { style: 'medium', color: { argb: COLORS.brand } },
        bottom: { style: 'medium', color: { argb: COLORS.brand } },
    };
};

const getFlowLabel = (entry) => entry.flowLabel || (entry.type === 'income' ? 'RECEITA' : 'DESPESA');
const getMethodLabel = (entry) => String(entry.accountMethod || '').trim() || '-';

/**
 * @param {{
 *   month: number,
 *   year: number,
 *   periodLabel: string,
 *   generatedAt: string,
 *   totals: { income: number, expense: number, balance: number },
 *   entries: Array<{
 *     date: string,
 *     description: string,
 *     category: string,
 *     accountMethod?: string,
 *     flowLabel?: string,
 *     type: 'income' | 'expense',
 *     amount: number
 *   }>
 * }} report
 * @returns {Promise<void>}
 */
export async function generateMonthlyFinancialExcel(report) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Codex';
    workbook.lastModifiedBy = 'Codex';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(SHEET_NAME, {
        views: [{ state: 'frozen', ySplit: 4 }],
    });

    sheet.columns = [
        { key: 'date', width: 14 },
        { key: 'description', width: 32 },
        { key: 'category', width: 22 },
        { key: 'type', width: 14 },
        { key: 'accountMethod', width: 24 },
        { key: 'amount', width: 18 },
    ];

    sheet.mergeCells('A1:D1');
    sheet.mergeCells('E1:F1');

    const titleCell = sheet.getCell('A1');
    titleCell.value = 'FINANCEIRO PRO - EXTRATO MENSAL';
    titleCell.font = {
        bold: true,
        size: 14,
        name: 'Consolas',
        color: { argb: COLORS.surface },
    };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.brand },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const periodCell = sheet.getCell('E1');
    periodCell.value = `MÊS: ${String(report.periodLabel || '-').toUpperCase()}`;
    periodCell.font = {
        bold: true,
        size: 12,
        name: 'Consolas',
        color: { argb: COLORS.surface },
    };
    periodCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.brand },
    };
    periodCell.alignment = { vertical: 'middle', horizontal: 'right' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:D2');
    sheet.mergeCells('E2:F2');

    const generatedAtCell = sheet.getCell('A2');
    generatedAtCell.value = `Gerado em: ${formatGeneratedAt(report.generatedAt)}`;
    generatedAtCell.font = {
        size: 10,
        color: { argb: COLORS.muted },
    };
    generatedAtCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.surfaceSoft },
    };
    generatedAtCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const metaCell = sheet.getCell('E2');
    metaCell.value = `${report.entries.length} registro(s) no período`;
    metaCell.font = {
        size: 10,
        color: { argb: COLORS.muted },
    };
    metaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.surfaceSoft },
    };
    metaCell.alignment = { vertical: 'middle', horizontal: 'right' };
    sheet.getRow(2).height = 20;

    sheet.getRow(3).height = 10;

    const headerRow = sheet.getRow(4);
    headerRow.values = ['DATA', 'DESCRIÇÃO', 'CATEGORIA', 'TIPO', 'CONTA/MÉTODO', 'VALOR (R$)'];
    headerRow.font = {
        bold: true,
        color: { argb: COLORS.ink },
    };
    headerRow.alignment = {
        vertical: 'middle',
        horizontal: 'left',
    };
    headerRow.height = 24;

    headerRow.eachCell((cell, columnNumber) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.surfaceSoft },
        };
        cell.border = {
            top: { style: 'thin', color: { argb: COLORS.line } },
            left: { style: 'thin', color: { argb: COLORS.line } },
            bottom: { style: 'medium', color: { argb: COLORS.lineStrong } },
            right: { style: 'thin', color: { argb: COLORS.line } },
        };

        if (columnNumber === 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        if (columnNumber === 6) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
    });

    let rowIndex = 5;

    if (report.entries.length) {
        report.entries.forEach((entry) => {
            const row = sheet.getRow(rowIndex);
            const typeLabel = getFlowLabel(entry);
            const dateValue = parseEntryDate(entry.date);
            const amountColor = entry.type === 'income' ? COLORS.success : COLORS.danger;
            const rowFill = entry.type === 'income' ? COLORS.successSoft : COLORS.dangerSoft;

            row.getCell(1).value = dateValue || entry.date || '-';
            row.getCell(2).value = entry.description || '-';
            row.getCell(3).value = entry.category || '-';
            row.getCell(4).value = typeLabel;
            row.getCell(5).value = getMethodLabel(entry);
            row.getCell(6).value = Number(entry.amount || 0);

            if (dateValue) {
                row.getCell(1).numFmt = DATE_FORMAT;
            }

            row.getCell(1).alignment = { horizontal: 'center' };
            row.getCell(4).alignment = { horizontal: 'center' };
            row.getCell(6).alignment = { horizontal: 'right' };
            row.getCell(6).numFmt = BRL_FORMAT;

            row.eachCell((cell) => {
                applyTableBorder(cell);
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: rowFill },
                };
            });

            row.getCell(2).font = { bold: true, color: { argb: COLORS.ink } };
            row.getCell(3).font = { italic: true, color: { argb: COLORS.muted } };
            row.getCell(4).font = { bold: true, color: { argb: amountColor } };
            row.getCell(6).font = { bold: true, color: { argb: amountColor }, name: 'Consolas' };

            row.height = 22;
            rowIndex += 1;
        });
    } else {
        sheet.mergeCells(`A${rowIndex}:F${rowIndex}`);

        const emptyCell = sheet.getCell(`A${rowIndex}`);
        emptyCell.value = 'Nenhuma movimentação encontrada para o período selecionado.';
        emptyCell.font = { italic: true, color: { argb: COLORS.muted } };
        emptyCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.surfaceSoft },
        };
        emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
        applyTableBorder(emptyCell);
        sheet.getRow(rowIndex).height = 24;
        rowIndex += 1;
    }

    const tableEndRow = rowIndex - 1;
    rowIndex += 1;

    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    const incomeLabelCell = sheet.getCell(`A${rowIndex}`);
    const incomeValueCell = sheet.getCell(`F${rowIndex}`);
    incomeLabelCell.value = 'TOTAL RECEITAS';
    incomeValueCell.value = Number(report.totals.income || 0);
    incomeValueCell.numFmt = BRL_FORMAT;

    sheet.mergeCells(`A${rowIndex + 1}:E${rowIndex + 1}`);
    const expenseLabelCell = sheet.getCell(`A${rowIndex + 1}`);
    const expenseValueCell = sheet.getCell(`F${rowIndex + 1}`);
    expenseLabelCell.value = 'TOTAL DESPESAS';
    expenseValueCell.value = Number(report.totals.expense || 0);
    expenseValueCell.numFmt = BRL_FORMAT;

    [incomeLabelCell, incomeValueCell].forEach((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.successSoft },
        };
        cell.font = { bold: true, color: { argb: COLORS.success } };
        applySummaryBorder(cell);
    });

    [expenseLabelCell, expenseValueCell].forEach((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.dangerSoft },
        };
        cell.font = { bold: true, color: { argb: COLORS.danger } };
        applySummaryBorder(cell);
    });

    incomeLabelCell.alignment = { horizontal: 'right' };
    incomeValueCell.alignment = { horizontal: 'right' };
    expenseLabelCell.alignment = { horizontal: 'right' };
    expenseValueCell.alignment = { horizontal: 'right' };

    const balanceRowIndex = rowIndex + 2;
    sheet.mergeCells(`A${balanceRowIndex}:E${balanceRowIndex}`);
    const balanceLabelCell = sheet.getCell(`A${balanceRowIndex}`);
    const balanceValueCell = sheet.getCell(`F${balanceRowIndex}`);
    const balanceColor = Number(report.totals.balance || 0) >= 0 ? COLORS.successSoft : COLORS.dangerSoft;

    balanceLabelCell.value = 'SALDO LÍQUIDO DO MÊS';
    balanceLabelCell.font = {
        bold: true,
        color: { argb: COLORS.surface },
        size: 11,
    };
    balanceLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.brand },
    };
    balanceLabelCell.alignment = { horizontal: 'left', vertical: 'middle' };

    balanceValueCell.value = Number(report.totals.balance || 0);
    balanceValueCell.numFmt = BRL_FORMAT;
    balanceValueCell.font = {
        bold: true,
        color: { argb: balanceColor },
        size: 13,
        name: 'Consolas',
    };
    balanceValueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.brand },
    };
    balanceValueCell.alignment = { horizontal: 'right', vertical: 'middle' };

    for (let column = 1; column <= 6; column += 1) {
        applyBalanceBorder(sheet.getRow(balanceRowIndex).getCell(column));
    }

    sheet.getRow(balanceRowIndex).height = 28;

    sheet.autoFilter = {
        from: 'A4',
        to: `F${Math.max(4, tableEndRow)}`,
    };

    const filename = `financeiro-pro-extrato-mensal-${formatFilePeriod(report.periodLabel)}.xlsx`;
    await downloadWorkbook(workbook, filename);
}
