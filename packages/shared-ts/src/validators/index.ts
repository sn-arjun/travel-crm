import { z } from 'zod';
import {
  USER_ROLES,
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  CONTACT_TYPES,
  INVOICE_STATUSES,
  SUPPORTED_CURRENCIES,
  TRIP_TYPES,
  LEAD_SOURCES,
} from '../constants/index';

// ─── Auth Validators ───────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantSlug: z.string().optional(),
});

export const otpLoginSchema = z.object({
  phone: z.string().min(7, 'Invalid phone number'),
  countryCode: z.string().regex(/^\+\d{1,4}$/, 'Invalid country code'),
});

export const otpVerifySchema = otpLoginSchema.extend({
  code: z.string().length(6, 'OTP must be 6 digits'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ─── Contact Validators ────────────────────────────────────
export const contactCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  countryCode: z.string().optional(),
  company: z.string().max(200).optional(),
  type: z.enum([
    CONTACT_TYPES.CUSTOMER,
    CONTACT_TYPES.SUPPLIER,
    CONTACT_TYPES.AGENT,
    CONTACT_TYPES.PARTNER,
  ]),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  source: z.string().max(50).optional(),
  birthday: z.string().optional(),
  anniversary: z.string().optional(),
  preferredLanguage: z.string().max(10).optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

// ─── Lead Validators ───────────────────────────────────────
export const leadCreateSchema = z.object({
  contactId: z.string().min(1, 'Contact is required'),
  title: z.string().min(1, 'Title is required').max(300),
  destination: z.string().max(200).optional(),
  travelDate: z.string().optional(),
  returnDate: z.string().optional(),
  paxAdults: z.number().int().min(0).default(1),
  paxChildren: z.number().int().min(0).default(0),
  paxInfants: z.number().int().min(0).default(0),
  budget: z.number().min(0).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).default('INR'),
  tripType: z.enum([TRIP_TYPES.DOMESTIC, TRIP_TYPES.INTERNATIONAL]).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  status: z.enum([
    LEAD_STATUSES.NEW,
    LEAD_STATUSES.CONTACTED,
    LEAD_STATUSES.QUALIFIED,
    LEAD_STATUSES.PROPOSAL_SENT,
    LEAD_STATUSES.NEGOTIATION,
    LEAD_STATUSES.WON,
    LEAD_STATUSES.LOST,
    LEAD_STATUSES.ON_HOLD,
  ]).default('new'),
  priority: z.enum([
    LEAD_PRIORITIES.HOT,
    LEAD_PRIORITIES.WARM,
    LEAD_PRIORITIES.COLD,
  ]).default('warm'),
  assignedTo: z.string().optional(),
  specialRequirements: z.string().max(2000).optional(),
});

export const leadUpdateSchema = leadCreateSchema.partial();

// ─── Follow-up Validators ──────────────────────────────────
export const followUpCreateSchema = z.object({
  leadId: z.string().min(1, 'Lead is required'),
  type: z.enum(['call', 'email', 'whatsapp', 'meeting', 'task']),
  scheduledAt: z.string().min(1, 'Schedule date is required'),
  notes: z.string().max(2000).optional(),
});

// ─── Invoice Validators ────────────────────────────────────
export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  taxRate: z.number().min(0).max(100).default(0),
});

export const invoiceCreateSchema = z.object({
  contactId: z.string().min(1, 'Contact is required'),
  leadId: z.string().optional(),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('INR'),
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
  notes: z.string().max(2000).optional(),
});

// ─── Type exports for form usage ───────────────────────────
export type LoginFormData = z.infer<typeof loginSchema>;
export type ContactCreateFormData = z.infer<typeof contactCreateSchema>;
export type LeadCreateFormData = z.infer<typeof leadCreateSchema>;
export type FollowUpCreateFormData = z.infer<typeof followUpCreateSchema>;
export type InvoiceCreateFormData = z.infer<typeof invoiceCreateSchema>;
