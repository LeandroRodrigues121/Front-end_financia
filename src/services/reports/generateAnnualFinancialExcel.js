import ExcelJS from 'exceljs';

const SHEET_NAME = 'Balanço Anual';
const BRL_FORMAT = '"R$" #,##0.00';

const COLORS = {
    brand: 'FF253148',
    ink: 'FF1A2B45',
    inkSoft: 'FF405E86',
    line: 'FFD7E0EC',
    lineStrong: 'FF2A3B56',
    surface: 'FFFFFFFF',
    surfaceSoft: 'FFF5F8FC',
    totalSurface: 'FFF0F4F9',
    success: 'FF00A86B',
    successSoft: 'FFCFF5DE',
    danger: 'FFFF2848',
    dangerSoft: 'FFFFEEF2',
    muted: 'FF8AA0BF',
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

const setSolidFill = (cell, color) => {
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
    };
};

const applyGridBorder = (cell) => {
    cell.border = {
        top: { style: 'thin', color: { argb: COLORS.line } },
        left: { style: 'thin', color: { argb: COLORS.line } },
        bottom: { style: 'thin', color: { argb: COLORS.line } },
        right: { style: 'thin', color: { argb: COLORS.line } },
    };
};

const applyTotalBorder = (cell) => {
    cell.border = {
        top: { style: 'medium', color: { argb: COLORS.lineStrong } },
        left: { style: 'thin', color: { argb: COLORS.line } },
        bottom: { style: 'thin', color: { argb: COLORS.lineStrong } },
        right: { style: 'thin', color: { argb: COLORS.line } },
    };
};

const buildFilename = (report) => `financeiro-pro-balanco-anual-${report.year}.xlsx`;

/**
 * @param {import('@/services/reports/buildAnnualFinancialReport').AnnualFinancialReport} report
 * @returns {Promise<void>}
 */
export async function generateAnnualFinancialExcel(report) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Codex';
    workbook.lastModifiedBy = 'Codex';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(SHEET_NAME, {
        views: [{ state: 'frozen', ySplit: 2 }],
    });

    sheet.columns = [
        { key: 'month', width: 24 },
        { key: 'income', width: 23 },
        { key: 'expense', width: 23 },
        { key: 'balance', width: 24 },
        { key: 'accumulated', width: 23 },
        { key: 'status', width: 20 },
    ];

    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `BALANÇO FINANCEIRO ANUAL - EXERCÍCIO ${report.year}`;
    titleCell.font = {
        bold: true,
        size: 15,
        name: 'Consolas',
        color: { argb: COLORS.surface },
    };
    titleCell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
    };
    setSolidFill(titleCell, COLORS.brand);
    applyGridBorder(titleCell);
    sheet.getRow(1).height = 38;

    const headerRow = sheet.getRow(2);
    headerRow.values = ['MÊS', 'RECEITAS', 'DESPESAS', 'RESULTADO (L/P)', 'ACUMULADO', 'STATUS'];
    headerRow.height = 34;
    headerRow.font = {
        bold: true,
        size: 12,
        name: 'Consolas',
        color: { argb: COLORS.surface },
    };
    headerRow.alignment = {
        horizontal: 'center',
        vertical: 'middle',
    };

    headerRow.eachCell((cell) => {
        setSolidFill(cell, COLORS.brand);
        applyGridBorder(cell);
    });

    let rowIndex = 3;

    report.rows.forEach((entry) => {
        const row = sheet.getRow(rowIndex);
        const isNegative = Number(entry.balance || 0) < 0;

        row.getCell(1).value = entry.monthLabel;
        row.getCell(2).value = Number(entry.income_total || 0);
        row.getCell(3).value = Number(entry.expense_total || 0);
        row.getCell(4).value = Number(entry.balance || 0);
        row.getCell(5).value = Number(entry.accumulated_balance || 0);
        row.getCell(6).value = entry.statusLabel;

        row.height = 30;

        for (let column = 1; column <= 6; column += 1) {
            applyGridBorder(row.getCell(column));
            setSolidFill(row.getCell(column), COLORS.surface);
        }

        row.getCell(1).font = {
            bold: true,
            size: 11,
            color: { argb: COLORS.ink },
        };
        row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

        [2, 3, 4, 5].forEach((columnNumber) => {
            row.getCell(columnNumber).numFmt = BRL_FORMAT;
            row.getCell(columnNumber).alignment = { horizontal: 'right', vertical: 'middle' };
            row.getCell(columnNumber).font = {
                bold: columnNumber >= 4,
                size: 11,
                name: 'Consolas',
                color: {
                    argb:
                        columnNumber === 3
                            ? COLORS.danger
                            : columnNumber === 4
                              ? isNegative
                                  ? COLORS.danger
                                  : COLORS.success
                              : COLORS.inkSoft,
                },
            };
        });

        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).font = {
            bold: true,
            size: 11,
            name: 'Consolas',
            color: { argb: isNegative ? COLORS.danger : COLORS.success },
        };

        rowIndex += 1;
    });

    const totalsRow = sheet.getRow(rowIndex);
    totalsRow.getCell(1).value = 'TOTAIS DO ANO';
    totalsRow.getCell(2).value = Number(report.totals.income_total || 0);
    totalsRow.getCell(3).value = Number(report.totals.expense_total || 0);
    totalsRow.getCell(4).value = Number(report.totals.balance || 0);
    totalsRow.getCell(5).value = Number(report.totals.balance || 0);
    totalsRow.getCell(6).value = '';
    totalsRow.height = 32;

    for (let column = 1; column <= 6; column += 1) {
        const cell = totalsRow.getCell(column);
        applyTotalBorder(cell);
        setSolidFill(cell, column === 4 ? COLORS.successSoft : COLORS.totalSurface);
        cell.alignment = {
            horizontal: column === 1 ? 'left' : column === 6 ? 'center' : 'right',
            vertical: 'middle',
        };
    }

    totalsRow.getCell(1).font = {
        bold: true,
        size: 11,
        name: 'Consolas',
        color: { argb: COLORS.ink },
    };

    [2, 3, 4, 5].forEach((columnNumber) => {
        totalsRow.getCell(columnNumber).numFmt = BRL_FORMAT;
        totalsRow.getCell(columnNumber).font = {
            bold: true,
            size: 12,
            name: 'Consolas',
            color: {
                argb:
                    columnNumber === 3
                        ? COLORS.danger
                        : columnNumber === 4
                          ? Number(report.totals.balance || 0) < 0
                              ? COLORS.danger
                              : COLORS.success
                          : COLORS.ink,
            },
        };
    });

    totalsRow.getCell(6).font = {
        size: 11,
        color: { argb: COLORS.muted },
    };

    await downloadWorkbook(workbook, buildFilename(report));
}
