import ExcelJS from 'exceljs';
import { ReportDefinition } from '../../types/report';
import { excelCurrencyFormat } from '../../utils/money';

/** Currency and locale the workbook is written in; the caller takes them from the agency's settings. */
export interface ExcelLocale {
    currency: string;
    locale: string;
}

export const excelExportService = {
    async generateExcel(reportDef: ReportDefinition, data: any[], money: ExcelLocale): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'TravelCRM Reports';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(reportDef.name);

        // Columns
        sheet.columns = reportDef.columns.map(col => ({
            header: col.name.toUpperCase().replace(/_/g, ' '),
            key: col.name,
            width: 20
        }));

        // Header styling
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Rows
        data.forEach(row => {
            sheet.addRow(row);
        });

        // Formatting based on type
        reportDef.columns.forEach((col, index) => {
            if (col.type === 'currency') {
                sheet.getColumn(index + 1).numFmt = excelCurrencyFormat(money.currency, money.locale);
            } else if (col.type === 'date') {
                sheet.getColumn(index + 1).numFmt = 'yyyy-mm-dd';
            } else if (col.type === 'number') {
                sheet.getColumn(index + 1).numFmt = '#,##0';
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
};
