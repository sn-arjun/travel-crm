import { z } from 'zod';

export const createVisaApplicationSchema = z.object({
    travellerId: z.string().min(1, 'Traveller is required'),
    leadId: z.string().optional().or(z.literal('')),
    destinationCountry: z.string().min(1, 'Destination country is required'),
    visaType: z.enum(['tourist', 'business', 'transit', 'student', 'work', 'medical']),
    status: z.enum(['not_started', 'documents_collecting', 'applied', 'processing', 'approved', 'rejected']).optional(),
    expectedDate: z.string().optional(),
});

export const updateVisaApplicationSchema = z.object({
    status: z.enum(['not_started', 'documents_collecting', 'applied', 'processing', 'approved', 'rejected']).optional(),
    applicationNumber: z.string().optional(),
    appliedDate: z.string().optional(),
    appointmentDate: z.string().optional(),
    expectedDate: z.string().optional(),
    approvedDate: z.string().optional(),
    rejectedDate: z.string().optional(),
    rejectionReason: z.string().optional(),
    visaNumber: z.string().optional(),
    visaIssueDate: z.string().optional(),
    visaExpiryDate: z.string().optional(),
    visaEntryType: z.enum(['single', 'multiple', 'transit']).optional(),
    embassyName: z.string().optional(),
    notes: z.string().optional(),
});

export const visaChecklistStatusSchema = z.object({
    isReceived: z.boolean(),
    notes: z.string().optional(),
});
