import { getLocaleContext } from '@/lib/locale';
import { client, type ApiResponse, type PaginatedResponse } from './client';
import { unwrapEntity } from './envelope';
import { API_ENDPOINTS } from './config';
import type { Invoice } from '@travelcrm/shared';
import { readBankDetails, type BankDetails } from '@/lib/bank-details';

export interface InvoiceLineItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  /** Omit for VAT / sales tax so the agency's rate applies; GST lines carry the chosen rate. */
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
  /** GST only: the rate for items without their own taxRate; VAT and sales tax use the agency's rate. */
  gstRate?: number;
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
  gstRate?: number;
}

export type TaxRegime = 'gst' | 'vat' | 'sales_tax' | 'none';

export interface TaxBreakdownLine {
  code: string;
  rate: number;
  base: number;
  amount: number;
  label: string;
}

/** POST /invoices/tax-preview: the tax the form shows, computed by the API. */
export interface TaxPreview {
  regime: TaxRegime;
  treatment: string;
  taxLines: TaxBreakdownLine[];
  notes: string[];
  placeOfSupply: string | null;
  sellerTaxId: string | null;
  buyerTaxId: string | null;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  totalTax: number;
  total: number;
  /** Rate a line gets without its own (VAT / sales tax); null under GST, where the user picks one. */
  defaultRate: number | null;
}

export interface TaxPreviewRequest {
  contactId?: string | null;
  invoiceId?: string | null;
  items: Array<{ rate: number; quantity: number; discountPercent?: number; taxRate?: number }>;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  /** GST only: the rate for lines that carry none. */
  gstRate?: number;
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

/** The link the customer pays through (the agency's own gateway). */
export interface InvoicePaymentLink {
  id: string;
  url: string;
  status: 'created' | 'paid' | 'expired' | 'cancelled' | string;
  gateway: 'razorpay' | 'stripe' | string | null;
}

/** POST /invoices/:id/payment-link */
export interface CreatedPaymentLink {
  invoiceId: string;
  gateway: 'razorpay' | 'stripe';
  mode: 'test' | 'live';
  linkId: string;
  url: string;
  status: string;
  amount: number;
  currency: string;
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
  /** Tax regime the invoice was issued under, with the rules applied (stored on the invoice). */
  taxRegime: TaxRegime;
  taxBreakdown: TaxBreakdownLine[];
  taxNotes: string[];
  sellerTaxId: string | null;
  buyerTaxId: string | null;
  placeOfSupply: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  notes: string | null;
  terms: string | null;
  /** Bank details the invoice was issued with (or the agency's current ones), and the country whose field set prints. */
  bankDetails: BankDetails;
  bankCountry: string;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
  /** The payment link on this invoice, if one was created. */
  paymentLink: InvoicePaymentLink | null;
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

function parseRegime(v: unknown): TaxRegime {
  return v === 'vat' || v === 'sales_tax' || v === 'none' ? v : 'gst';
}

/** The API stores JSON text; accept text or an already parsed array. */
function parseJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || v === '') return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return v.trim() ? [v] : [];
  }
}

function normalizeTaxLine(raw: unknown): TaxBreakdownLine {
  const r = (raw && typeof raw === 'object' ? raw : {}) as RawRow;
  return { code: String(r.code ?? ''), rate: numOf(r.rate), base: numOf(r.base), amount: numOf(r.amount), label: String(r.label ?? r.code ?? 'Tax') };
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

function normalizePaymentLink(raw: RawRow): InvoicePaymentLink | null {
  const url = strOrNull(pick(raw, 'paymentLinkUrl', 'payment_link_url'));
  const id = strOrNull(pick(raw, 'paymentLinkId', 'payment_link_id'));
  if (!url || !id) return null;
  return {
    id,
    url,
    status: strOrNull(pick(raw, 'paymentLinkStatus', 'payment_link_status')) ?? 'created',
    gateway: strOrNull(pick(raw, 'paymentLinkGateway', 'payment_link_gateway')),
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
    currency: String(raw.currency ?? getLocaleContext().currency),
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
    taxRegime: parseRegime(pick(raw, 'taxRegime', 'tax_regime')),
    taxBreakdown: parseJsonArray(pick(raw, 'taxBreakdown', 'tax_breakdown')).map(normalizeTaxLine),
    taxNotes: parseJsonArray(pick(raw, 'taxNotes', 'tax_notes')).map(String),
    sellerTaxId: strOrNull(pick(raw, 'sellerTaxId', 'seller_tax_id')),
    buyerTaxId: strOrNull(pick(raw, 'buyerTaxId', 'buyer_tax_id')),
    placeOfSupply: strOrNull(pick(raw, 'placeOfSupply', 'place_of_supply')),
    totalAmount: total,
    paidAmount: paid,
    balanceDue: balance === undefined || balance === null ? total - paid : numOf(balance),
    notes: strOrNull(raw.notes),
    terms: strOrNull(raw.terms),
    bankDetails: readBankDetails(pick(raw, 'bankDetails', 'bank_details')),
    bankCountry: String(pick(raw, 'bankCountry', 'bank_country') ?? ''),
    items: asRows(raw.items).map(normalizeInvoiceItem),
    payments: asRows(raw.payments).map(normalizeInvoicePayment),
    paymentLink: normalizePaymentLink(raw),
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

  /** Tax for a contact and lines under the agency's regime (or the invoice's own, when editing). */
  taxPreview: async (data: TaxPreviewRequest): Promise<TaxPreview | null> => {
    const raw = unwrapEntity<TaxPreview>(await client.post<unknown>(API_ENDPOINTS.invoices.create + '/tax-preview', data));
    return raw && typeof raw === 'object' && 'taxLines' in raw ? raw : null;
  },

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

  /** A link to pay the balance due through the agency's own Razorpay or Stripe account. */
  createPaymentLink: (id: string, data?: { gateway?: 'razorpay' | 'stripe' }) =>
    client.post<ApiResponse<CreatedPaymentLink>>(API_ENDPOINTS.invoices.paymentLink(id), data ?? {}),

  cancelPaymentLink: (id: string) =>
    client.delete<ApiResponse<{ invoiceId: string; status: string }>>(API_ENDPOINTS.invoices.paymentLink(id)),

  summary: () =>
    client.get<ApiResponse<{ outstanding: number; overdue: number; paidThisMonth: number; invoicedThisMonth: number }>>(API_ENDPOINTS.invoices.summary),

  fromItinerary: (data: { itineraryId: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.fromItinerary, data),
};
