import { client, type ApiResponse, type PaginatedResponse } from './client';
import { unwrapEntity } from './envelope';
import { API_ENDPOINTS } from './config';
import type { Invoice } from '@travelcrm/shared';

export interface InvoiceLineItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface CreateInvoiceRequest {
  contactId: string;
  leadId?: string;
  type?: 'tax_invoice' | 'proforma' | 'receipt';
  items: InvoiceLineItem[];
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  issueDate?: string;
  dueDate?: string;
  terms?: string;
  notes?: string;
  bankDetails?: Record<string, unknown>;
  currency?: string;
}

export interface UpdateInvoiceRequest {
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  items?: InvoiceLineItem[];
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  terms?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

/** A line on an invoice, as shown on the detail page. */
export interface InvoiceItemRow {
  id?: string;
  description: string;
  hsnCode: string | null;
  quantity: number;
  rate: number;
  taxRate: number;
  amount: number;
}

/** A payment recorded against an invoice. */
export interface InvoicePaymentRow {
  id: string;
  amount: number;
  date: string | null;
  method: string;
  reference: string | null;
  notes: string | null;
}

/** GET /invoices/:id with camelCase fields and numeric money. */
export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  currency: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  leadId: string | null;
  /** The invoice issue date (falls back to the creation date for older invoices). */
  issueDate: string | null;
  dueDate: string | null;
  subtotal: number;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number;
  discountAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  notes: string | null;
  terms: string | null;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
}

type RawRow = Record<string, unknown>;

function pick(row: RawRow, camel: string, snake: string): unknown {
  return row[camel] ?? row[snake];
}

function numOf(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function asRows(v: unknown): RawRow[] {
  return Array.isArray(v) ? (v as RawRow[]) : [];
}

export function normalizeInvoiceItem(raw: RawRow): InvoiceItemRow {
  return {
    id: strOrNull(raw.id) ?? undefined,
    description: String(raw.description ?? ''),
    hsnCode: strOrNull(pick(raw, 'hsnCode', 'hsn_code')),
    quantity: numOf(raw.quantity),
    rate: numOf(raw.rate ?? raw.unitPrice ?? raw.unit_price),
    taxRate: numOf(pick(raw, 'taxRate', 'tax_rate')),
    amount: numOf(raw.amount),
  };
}

export function normalizeInvoicePayment(raw: RawRow): InvoicePaymentRow {
  return {
    id: String(raw.id ?? ''),
    amount: numOf(raw.amount),
    date: strOrNull(raw.date ?? pick(raw, 'paymentDate', 'payment_date') ?? pick(raw, 'createdAt', 'created_at')),
    method: String(raw.method ?? pick(raw, 'paymentMethod', 'payment_method') ?? ''),
    reference: strOrNull(raw.reference),
    notes: strOrNull(raw.notes),
  };
}

export function normalizeInvoiceDetail(input: unknown): InvoiceDetail | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as RawRow;
  const total = numOf(raw.totalAmount ?? raw.total);
  const paid = numOf(pick(raw, 'paidAmount', 'paid_amount'));
  const balance = pick(raw, 'balanceDue', 'balance_due');
  const discountType = pick(raw, 'discountType', 'discount_type');
  return {
    id: String(raw.id ?? ''),
    invoiceNumber: String(pick(raw, 'invoiceNumber', 'invoice_number') ?? ''),
    type: String(raw.type ?? 'tax_invoice'),
    status: String(raw.status ?? 'draft'),
    currency: String(raw.currency ?? 'INR'),
    contactId: String(pick(raw, 'contactId', 'contact_id') ?? ''),
    contactName: String(pick(raw, 'contactName', 'contact_name') ?? ''),
    contactEmail: strOrNull(pick(raw, 'contactEmail', 'contact_email')),
    contactPhone: strOrNull(pick(raw, 'contactPhone', 'contact_phone')),
    leadId: strOrNull(pick(raw, 'leadId', 'lead_id')),
    issueDate: strOrNull(pick(raw, 'issueDate', 'issue_date') ?? pick(raw, 'createdAt', 'created_at')),
    dueDate: strOrNull(pick(raw, 'dueDate', 'due_date')),
    subtotal: numOf(raw.subtotal),
    discountType: discountType === 'percentage' || discountType === 'fixed' ? discountType : null,
    discountValue: numOf(pick(raw, 'discountValue', 'discount_value')),
    discountAmount: numOf(pick(raw, 'discountAmount', 'discount_amount')),
    cgst: numOf(raw.cgst),
    sgst: numOf(raw.sgst),
    igst: numOf(raw.igst),
    totalTax: numOf(pick(raw, 'totalTax', 'total_tax')),
    totalAmount: total,
    paidAmount: paid,
    balanceDue: balance === undefined || balance === null ? total - paid : numOf(balance),
    notes: strOrNull(raw.notes),
    terms: strOrNull(raw.terms),
    items: asRows(raw.items).map(normalizeInvoiceItem),
    payments: asRows(raw.payments).map(normalizeInvoicePayment),
  };
}

export interface InvoicePayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

export interface DuplicateInvoiceRequest {
  newInvoiceNumber?: string;
  newIssueDate?: string;
}

export const invoicesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    leadId?: string;
    contactId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Invoice>>>(API_ENDPOINTS.invoices.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.byId(id)),

  /** Invoice detail with camelCase fields, numeric money, line items and payments. */
  getDetail: async (id: string): Promise<InvoiceDetail | null> =>
    normalizeInvoiceDetail(unwrapEntity<unknown>(await client.get<unknown>(API_ENDPOINTS.invoices.byId(id)))),

  create: (data: CreateInvoiceRequest) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.create, data),

  update: (id: string, data: UpdateInvoiceRequest) =>
    client.put<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.invoices.byId(id)),

  getPayments: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<InvoicePayment>>>(API_ENDPOINTS.invoices.payments(id), { params }),

  void: (id: string, data?: { reason?: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.void(id), data),

  duplicate: (id: string, data?: DuplicateInvoiceRequest) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.duplicate(id), data),

  send: (id: string, data: { channel: 'email' | 'whatsapp'; to: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.send(id), data),

  summary: () =>
    client.get<ApiResponse<{ outstanding: number; overdue: number; paidThisMonth: number; invoicedThisMonth: number }>>(API_ENDPOINTS.invoices.summary),

  fromItinerary: (data: { itineraryId: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.fromItinerary, data),
};
