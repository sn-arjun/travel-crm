import { z } from 'zod';

export const supplierPaymentSchema = z.object({
    amount: z.number().min(0.01, 'Amount must be greater than 0'),
    method: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'online', 'ideal', 'sepa_transfer']),
    reference_number: z.string().optional(),
    payment_date: z.string().min(1, 'Payment date is required'), // ISO Date
    notes: z.string().optional(),
    invoice_ref: z.string().optional(),
});

export const reconcilePaymentsSchema = z.object({
    payment_ids: z.array(z.string()).min(1),
    notes: z.string().optional(),
});
