import { z } from 'zod';

export const createSupplierSchema = z.object({
    companyName: z.string().min(1, 'Company name is required'),
    contactPerson: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number').optional().or(z.literal('')),
    taxId: z.string().optional(),
    category: z.enum(['hotel', 'transport', 'airline', 'activity_provider', 'guide', 'visa_agent', 'insurance']),
    website: z.string().url('Invalid URL').optional().or(z.literal('')),
    notes: z.string().optional(),
    isPreferred: z.boolean().optional(),
    status: z.enum(['active', 'inactive']).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const supplierListSchema = z.object({
    page: z.string().regex(/^\d+$/).default('1').transform(Number),
    limit: z.string().regex(/^\d+$/).default('20').transform(Number),
    category: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_order: z.string().optional(),
    is_preferred: z.string().transform(v => v === 'true').optional(),
});

export const rateSupplierSchema = z.object({
    rating: z.number().min(1).max(5),
});
