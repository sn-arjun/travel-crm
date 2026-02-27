import * as XLSX from 'xlsx';

export class TemplateGenerator {
    /**
     * Generates a template Excel file buffer for a specific import type.
     */
    public generateTemplate(importType: string): Buffer {
        let headers: string[] = [];

        switch (importType) {
            case 'contacts':
                headers = ['firstName', 'lastName', 'email', 'phone', 'company', 'tags'];
                break;
            case 'leads':
                headers = ['title', 'firstName', 'lastName', 'email', 'phone', 'value', 'status'];
                break;
            case 'suppliers':
                headers = ['name', 'category', 'email', 'phone', 'country', 'city'];
                break;
            case 'rate_cards':
                headers = ['supplierName', 'serviceType', 'costPrice', 'currency', 'seasonStart', 'seasonEnd'];
                break;
            case 'travellers':
                headers = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'passportNumber'];
                break;
            default:
                throw new Error(`Unsupported import type: ${importType}`);
        }

        // Create a worksheet from the headers array (as the first row)
        const ws = XLSX.utils.aoa_to_sheet([headers]);

        // Create a new workbook and append the worksheet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');

        // Generate buffer (SheetJS uses Buffer polyfill under the hood, but in Node output it works well)
        // For cloudflare, we output array array buffer, but here we can return a Uint8Array
        const u8: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return Buffer.from(u8);
    }
}
