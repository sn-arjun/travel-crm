import { z } from 'zod';

// We map each import type to a Zod schema representing its intended structure
/**
 * Accepted contact name inputs: a single `name` column, or `firstName` (+ optional `lastName`).
 * `name` wins when present; at least one of them is required.
 */
export function resolveContactName(d: { name?: string; firstName?: string; lastName?: string }): string {
    const single = (d.name ?? '').trim();
    if (single) return single;
    return [d.firstName, d.lastName].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
}

const contactImportSchema = z
    .object({
        name: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email('Invalid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        company: z.string().optional(),
        tags: z.string().optional(), // Comma separated tags
    })
    .superRefine((d, ctx) => {
        if (!resolveContactName(d)) {
            ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name is required (a Name column, or a First name)' });
        }
    })
    .transform((d) => ({ ...d, name: resolveContactName(d) }));

export const ImportSchemas = {
    contacts: contactImportSchema,
    leads: z.object({
        title: z.string().min(1, 'Lead title/subject is required'),
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().optional(),
        email: z.string().email('Invalid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        value: z.number().optional().or(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Value must be a number')),
        status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']).optional().default('new'),
    }),
    suppliers: z.object({
        name: z.string().min(1, 'Supplier name is required'),
        category: z.string().min(1, 'Category is required'),
        email: z.string().email('Invalid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
    }),
    rate_cards: z.object({
        supplierName: z.string().min(1, 'Supplier name is required (or ID)'),
        serviceType: z.string().min(1, 'Service type is required'),
        name: z.string().optional(),
        costPrice: z.number().or(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number')),
        sellPrice: z.number().or(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number')).optional(),
        sellingPrice: z.number().or(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number')).optional(),
        currency: z.string().min(3, 'Currency code requires 3 chars').max(3).optional().default('INR'),
        seasonStart: z.string().optional(),
        seasonEnd: z.string().optional(),
        validFrom: z.string().optional(),
        validTo: z.string().optional(),
    }),
    travellers: z.object({
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().optional(),
        email: z.string().email('Invalid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        passportNumber: z.string().optional(),
    })
} as const;

export type ImportType = keyof typeof ImportSchemas;

export interface ValidationErrorItem {
    field: string;
    message: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationErrorItem[];
    validData: any;
}

export class ImportValidator {
    /**
     * Validates a single row of imported data against the specified import type schema
     * @param importType The type of import (contacts, leads, etc.)
     * @param row The raw object mapped from the CSV/Excel file
     * @param mapping Optional mapping to rename keys dynamically (e.g. { 'First Name': 'firstName' })
     */
    public async validateRow(importType: string, row: Record<string, any>, mapping?: Record<string, string>): Promise<ValidationResult> {
        const schema = ImportSchemas[importType as ImportType];
        if (!schema) {
            throw new Error(`Unsupported import type: ${importType}`);
        }

        // Apply column mapping if provided
        let dataToValidate = { ...row };
        if (mapping) {
            dataToValidate = {};
            for (const [csvCol, crmField] of Object.entries(mapping)) {
                // Only map if the field exists in the row, or fallback gracefully
                if (row[csvCol] !== undefined) {
                    dataToValidate[crmField] = row[csvCol];
                } else if (row[crmField] !== undefined) {
                    // Fallback if the map isn't needed
                    dataToValidate[crmField] = row[crmField];
                }
            }
        }

        try {
            const validData = await schema.parseAsync(dataToValidate);
            return {
                isValid: true,
                errors: [],
                validData
            };
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                const validationErrors: ValidationErrorItem[] = error.issues.map((err: any) => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                return {
                    isValid: false,
                    errors: validationErrors,
                    validData: null
                };
            }

            return {
                isValid: false,
                errors: [{ field: 'general', message: 'Unknown validation error occurred.' }],
                validData: null
            };
        }
    }
}
