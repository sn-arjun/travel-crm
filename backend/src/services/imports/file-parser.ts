import * as XLSX from 'xlsx';

export interface ParseResult {
    headers: string[];
    data: Record<string, any>[];
    totalRows: number;
}

export class FileParser {
    /**
     * Parses an Excel or CSV file buffer and returns the data as an array of objects.
     * Uses SheetJS (xlsx) which is edge-compatible when given a raw ArrayBuffer/Buffer.
     */
    public async parseFile(buffer: ArrayBuffer | Uint8Array, fileName: string): Promise<ParseResult> {
        // Read the workbook from the buffer
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        // We assume the data is in the first sheet
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            throw new Error('The uploaded file does not contain any sheets.');
        }

        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        // header: 1 means generate an array of arrays, which lets us extract headers reliably
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (rawData.length === 0) {
            return { headers: [], data: [], totalRows: 0 };
        }

        // Extract headers (first row). Filter out empty cells to establish valid columns.
        const rawHeaders = rawData[0] || [];
        const headers = rawHeaders.map(h => h ? String(h).trim() : '').filter(h => h !== '');

        if (headers.length === 0) {
            throw new Error('No valid headers found in the first row of the file.');
        }

        // Convert remaining rows to objects mapping headers to values
        const data: Record<string, any>[] = [];

        // Process rows starting from index 1 (skip header)
        for (let i = 1; i < rawData.length; i++) {
            const rowArr = rawData[i];
            // Skip completely empty rows
            if (!rowArr || rowArr.length === 0 || rowArr.every(val => val === null || val === undefined || val === '')) {
                continue;
            }

            const rowObj: Record<string, any> = {};

            // Map each column of the row to its corresponding header
            for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                // Some rows might be shorter than the headers array
                const cellValue = colIndex < rowArr.length ? rowArr[colIndex] : null;
                rowObj[headers[colIndex]] = cellValue;
            }

            data.push(rowObj);
        }

        return {
            headers,
            data,
            totalRows: data.length,
        };
    }
}
