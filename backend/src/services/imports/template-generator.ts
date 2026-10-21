import * as XLSX from 'xlsx';

interface TemplateField {
    header: string;
    required: boolean;
    format: string;
    allowedValues?: string;
    example: string;
}

const TEMPLATE_DEFINITIONS: Record<string, TemplateField[]> = {
    contacts: [
        { header: 'First Name *', required: true, format: 'text', example: 'Rahul' },
        { header: 'Last Name', required: false, format: 'text', example: 'Sharma' },
        { header: 'Email *', required: true, format: 'email', example: 'rahul@example.com' },
        { header: 'Phone', required: false, format: 'phone (+91XXXXXXXXXX)', example: '+919876543210' },
        { header: 'Company', required: false, format: 'text', example: 'Acme Corp' },
        { header: 'Type', required: false, format: 'text', allowedValues: 'individual|corporate|agent', example: 'individual' },
        { header: 'Tags', required: false, format: 'comma-separated', example: 'vip,corporate' },
    ],
    leads: [
        { header: 'Title *', required: true, format: 'text', example: 'Maldives Honeymoon Package' },
        { header: 'First Name *', required: true, format: 'text', example: 'Priya' },
        { header: 'Last Name', required: false, format: 'text', example: 'Patel' },
        { header: 'Email', required: false, format: 'email', example: 'priya@example.com' },
        { header: 'Phone', required: false, format: 'phone (+91XXXXXXXXXX)', example: '+919876543211' },
        { header: 'Destination', required: false, format: 'text', example: 'Maldives' },
        { header: 'Travel Date', required: false, format: 'date (YYYY-MM-DD)', example: '2026-06-15' },
        { header: 'Budget', required: false, format: 'number', example: '150000' },
        { header: 'Status', required: false, format: 'text', allowedValues: 'new|contacted|qualified|proposal|won|lost', example: 'new' },
    ],
    suppliers: [
        { header: 'Company Name *', required: true, format: 'text', example: 'Sunrise Hotels Pvt Ltd' },
        { header: 'Category *', required: true, format: 'text', allowedValues: 'hotel|transport|activity|airline|visa|other', example: 'hotel' },
        { header: 'Email', required: false, format: 'email', example: 'contact@sunrisehotels.com' },
        { header: 'Phone', required: false, format: 'phone', example: '+919876543212' },
        { header: 'Country', required: false, format: 'text', example: 'India' },
        { header: 'City', required: false, format: 'text', example: 'Mumbai' },
    ],
    rate_cards: [
        { header: 'Supplier Name *', required: true, format: 'text (must match existing supplier)', example: 'Sunrise Hotels Pvt Ltd' },
        { header: 'Service Type *', required: true, format: 'text', allowedValues: 'hotel|transport|activity|flight|visa|guide|other', example: 'hotel' },
        { header: 'Service Name', required: false, format: 'text', example: 'Deluxe Room (Double)' },
        { header: 'Cost Price *', required: true, format: 'number (no symbols)', example: '5000' },
        { header: 'Sell Price', required: false, format: 'number (no symbols)', example: '7000' },
        { header: 'Currency', required: false, format: 'text', allowedValues: '', example: '' },
        { header: 'Valid From', required: false, format: 'date (YYYY-MM-DD)', example: '2026-01-01' },
        { header: 'Valid To', required: false, format: 'date (YYYY-MM-DD)', example: '2026-12-31' },
    ],
    travellers: [
        { header: 'First Name *', required: true, format: 'text (as in passport)', example: 'Amit' },
        { header: 'Last Name *', required: true, format: 'text (as in passport)', example: 'Kumar' },
        { header: 'Email', required: false, format: 'email', example: 'amit@example.com' },
        { header: 'Phone', required: false, format: 'phone', example: '+919876543213' },
        { header: 'Date of Birth', required: false, format: 'date (YYYY-MM-DD)', example: '1990-05-20' },
        { header: 'Passport Number', required: false, format: 'text', example: 'P1234567' },
    ],
};

/** The Currency column lists the agency currency first and uses it as the example. */
function currencyField(agencyCurrency: string): TemplateField {
    const codes = [agencyCurrency, ...['EUR', 'USD', 'GBP', 'AED', 'THB'].filter((c) => c !== agencyCurrency)];
    return { header: 'Currency', required: false, format: 'text', allowedValues: codes.join('|'), example: agencyCurrency };
}

export class TemplateGenerator {
    /**
     * Generates a template Excel file for a specific import type.
     * Includes human-readable headers with * for required, a sample data row, and a Field Guide sheet.
     */
    public generateTemplate(importType: string, agencyCurrency: string): Buffer {
        const fields = TEMPLATE_DEFINITIONS[importType]?.map((f) => (f.header === 'Currency' ? currencyField(agencyCurrency) : f));
        if (!fields) {
            throw new Error(`Unsupported import type: ${importType}`);
        }

        const headers = fields.map(f => f.header);
        const sampleRow = fields.map(f => f.example);

        // Main Template sheet: header row + 1 sample row
        const templateWs = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        templateWs['!cols'] = fields.map(f => ({
            wch: Math.max(f.header.length + 2, f.example.length + 2),
        }));

        // Field Guide sheet
        const guideRows: string[][] = [
            ['Field Name', 'Required?', 'Format', 'Allowed Values', 'Example'],
            ...fields.map(f => [
                f.header,
                f.required ? 'Yes' : 'No',
                f.format,
                f.allowedValues || '',
                f.example,
            ]),
        ];
        const guideWs = XLSX.utils.aoa_to_sheet(guideRows);
        guideWs['!cols'] = [
            { wch: 25 }, { wch: 10 }, { wch: 35 }, { wch: 35 }, { wch: 30 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, templateWs, 'Template');
        XLSX.utils.book_append_sheet(wb, guideWs, 'Field Guide');

        const u8: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return Buffer.from(u8);
    }
}
