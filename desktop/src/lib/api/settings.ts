import { getLocaleContext } from '@/lib/locale';
import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';
import { usersApi } from './users';
import type { User } from '@travelcrm/shared';
import { setLocaleContext } from '../locale';
import { useAuthStore } from '@/stores/auth-store';
import { readBankDetails } from '@/lib/bank-details';

// The backend stores company settings as flat key/value rows. The UI works
// with camelCase fields, so every call below maps between the two shapes.

export interface CompanySettings {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
  logoUrl: string;
  timezone: string;
  currency: string;
  language: string;
  /** BCP 47 tag the agency writes numbers and dates in, e.g. en-GB. */
  locale: string;
  /** ISO 3166 country phone numbers are read in when typed without a country code. */
  phoneDefaultCountry: string;
}

export type UpdateCompanySettingsRequest = Partial<Omit<CompanySettings, 'logoUrl'>>;

const COMPANY_KEYS: Record<keyof Omit<CompanySettings, 'logoUrl'>, string> = {
  name: 'company_name',
  email: 'company_email',
  phone: 'company_phone',
  website: 'company_website',
  address: 'company_address',
  city: 'company_city',
  state: 'company_state',
  postalCode: 'company_postal_code',
  country: 'company_country',
  gstin: 'gstin',
  timezone: 'timezone',
  currency: 'currency',
  language: 'language',
  locale: 'locale',
  phoneDefaultCountry: 'phone_default_country',
};

function fromCompanyKeys(raw: Record<string, string | null> | null | undefined): CompanySettings {
  const r = raw ?? {};
  const out = { logoUrl: r.company_logo ?? '' } as CompanySettings;
  for (const [field, key] of Object.entries(COMPANY_KEYS)) {
    (out as unknown as Record<string, string>)[field] = r[key] ?? '';
  }
  return out;
}

function toCompanyKeys(data: UpdateCompanySettingsRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(data)) {
    const key = COMPANY_KEYS[field as keyof typeof COMPANY_KEYS];
    if (key && value !== undefined) out[key] = value;
  }
  return out;
}

export interface Logo {
  logoUrl: string;
}

export interface UploadLogoRequest {
  file: File;
}

export type AssignmentMode = 'round_robin' | 'manual' | 'source_based';

export interface AssignmentMember {
  userId: string;
  weight?: number;
}

export interface AssignmentRules {
  mode: AssignmentMode;
  rules: AssignmentMember[];
}

export type LeadSource = 'manual' | 'website' | 'facebook' | 'google' | 'referral' | 'walkin';

export interface RoutingRule {
  source: LeadSource;
  assignToUserId: string;
}

export type FollowUpStepType = 'call' | 'email' | 'whatsapp' | 'visit' | 'sms';

export interface FollowUpStep {
  day: number;
  type: FollowUpStepType;
  notes?: string;
  templateId?: string;
}

export interface FollowUpSequence {
  id: string;
  name: string;
  triggerStatus: string;
  steps: FollowUpStep[];
  isActive: boolean;
}

export interface CreateFollowUpSequenceRequest {
  name: string;
  triggerStatus: string;
  steps: FollowUpStep[];
  isActive?: boolean;
}

export type UpdateFollowUpSequenceRequest = Partial<CreateFollowUpSequenceRequest>;

export type TaxSystem = 'gst' | 'vat' | 'sales_tax' | 'none';

export interface InvoiceDefaults {
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  /** The account name (stored as accountName; accountHolderName is kept alongside for older readers). */
  accountHolderName: string;
  upiId: string;
  /** Country-shaped bank fields (R140): which of them show follows the agency country (lib/bank-details.ts). */
  iban?: string;
  bic?: string;
  sortCode?: string;
  routingNumber?: string;
  bsb?: string;
  swift?: string;
  gstin: string;
  companyState: string;
  taxSystem: TaxSystem;
  defaultTaxRate: number;
  defaultDueDays: number;
  defaultPaymentTerms: string;
  /** Tax engine (R201): the agency's country and its own rates and registration number. */
  country?: string;
  /** VAT standard rate in percent; blank means the country default (GB 20, AE 5, SA 15, DE 19). */
  vatRate?: number | null;
  salesTaxRate?: number | null;
  /** VAT number or other tax registration (GSTIN is kept in `gstin`). */
  sellerTaxId?: string;
  /** Optional name printed for the VAT / sales tax line, for example GST. */
  taxLabel?: string;
}

export interface NumberingConfig {
  invoicePrefix: string;
  proformaPrefix: string;
  receiptPrefix: string;
  creditNotePrefix: string;
  debitNotePrefix: string;
  voucherPrefix: string;
  fyStartMonth: number;
  resetYearly: boolean;
}

export interface ItineraryDefaults {
  defaultCurrency: string;
  validityDays: number;
  childPricePercent: number;
  groupDiscountThreshold: number;
  groupDiscountPercent: number;
  defaultInclusions: string[];
  defaultExclusions: string[];
  defaultTerms: string;
}

type Raw = Record<string, unknown>;

/** Maps the `data` of a successful response, passing error shapes through. */
function mapData<A, B>(res: ApiResponse<A>, fn: (data: A) => B): ApiResponse<B> {
  if (!res || !('data' in res)) return res as unknown as ApiResponse<B>;
  return { ...res, data: fn(res.data) };
}

const str = (v: unknown, fallback = '') => (v === undefined || v === null ? fallback : String(v));
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || Number.isNaN(n) ? fallback : n;
};

function fromInvoiceDefaults(r: Raw): InvoiceDefaults {
  // Old and new keys alike (accountHolderName / accountName, the separate upi_id) read as one shape.
  const bank = readBankDetails(r.bank_details, r.upi_id);
  return {
    bankName: str(bank.bankName),
    accountNumber: str(bank.accountNumber),
    ifsc: str(bank.ifsc),
    branch: str(bank.branch),
    accountHolderName: str(bank.accountName),
    upiId: str(bank.upiId),
    iban: str(bank.iban),
    bic: str(bank.bic),
    sortCode: str(bank.sortCode),
    routingNumber: str(bank.routingNumber),
    bsb: str(bank.bsb),
    swift: str(bank.swift),
    gstin: str(r.gstin),
    companyState: str(r.company_state),
    taxSystem: str(r.tax_system, 'gst') as TaxSystem,
    defaultTaxRate: num(r.default_tax_rate, 18),
    defaultDueDays: num(r.default_due_days, 30),
    defaultPaymentTerms: str(r.default_payment_terms),
    country: str(r.country ?? r.company_country),
    vatRate: r.vat_rate === undefined || r.vat_rate === null || r.vat_rate === '' ? null : num(r.vat_rate, 0),
    salesTaxRate: r.sales_tax_rate === undefined || r.sales_tax_rate === null || r.sales_tax_rate === '' ? null : num(r.sales_tax_rate, 0),
    sellerTaxId: str(r.seller_tax_id),
    taxLabel: str(r.tax_label),
  };
}

function toInvoiceDefaults(d: InvoiceDefaults): Raw {
  return {
    bank_details: {
      bankName: d.bankName,
      accountNumber: d.accountNumber,
      ifsc: d.ifsc,
      branch: d.branch,
      accountName: d.accountHolderName,
      accountHolderName: d.accountHolderName,
      upiId: d.upiId,
      iban: d.iban ?? '',
      bic: d.bic ?? '',
      sortCode: d.sortCode ?? '',
      routingNumber: d.routingNumber ?? '',
      bsb: d.bsb ?? '',
      swift: d.swift ?? '',
    },
    upi_id: d.upiId,
    gstin: d.gstin,
    company_state: d.companyState,
    tax_system: d.taxSystem,
    default_tax_type: d.taxSystem,
    default_tax_rate: d.defaultTaxRate,
    default_due_days: d.defaultDueDays,
    default_payment_terms: d.defaultPaymentTerms,
    ...(d.country !== undefined && { country: d.country }),
    ...(d.vatRate != null && { vat_rate: d.vatRate }),
    ...(d.salesTaxRate != null && { sales_tax_rate: d.salesTaxRate }),
    ...(d.sellerTaxId !== undefined && { seller_tax_id: d.sellerTaxId }),
    ...(d.taxLabel !== undefined && { tax_label: d.taxLabel }),
  };
}

function fromNumbering(r: Raw): NumberingConfig {
  return {
    invoicePrefix: str(r.invoice_prefix, 'INV'),
    proformaPrefix: str(r.proforma_prefix, 'PI'),
    receiptPrefix: str(r.receipt_prefix, 'RCP'),
    creditNotePrefix: str(r.credit_note_prefix, 'CN'),
    debitNotePrefix: str(r.debit_note_prefix, 'DN'),
    voucherPrefix: str(r.voucher_prefix, 'VCH'),
    fyStartMonth: num(r.fy_start_month, 4),
    resetYearly: r.reset_yearly === undefined ? true : Boolean(r.reset_yearly),
  };
}

function toNumbering(d: NumberingConfig): Raw {
  return {
    invoice_prefix: d.invoicePrefix,
    proforma_prefix: d.proformaPrefix,
    receipt_prefix: d.receiptPrefix,
    credit_note_prefix: d.creditNotePrefix,
    debit_note_prefix: d.debitNotePrefix,
    voucher_prefix: d.voucherPrefix,
    fy_start_month: d.fyStartMonth,
    reset_yearly: d.resetYearly,
  };
}

function fromItineraryDefaults(r: Raw): ItineraryDefaults {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    defaultCurrency: str(r.defaultCurrency, getLocaleContext().currency),
    validityDays: num(r.validityDays, 7),
    childPricePercent: num(r.childPricePercent, 50),
    groupDiscountThreshold: num(r.groupDiscountThreshold, 10),
    groupDiscountPercent: num(r.groupDiscountPercent, 5),
    defaultInclusions: list(r.defaultInclusions),
    defaultExclusions: list(r.defaultExclusions),
    defaultTerms: str(r.defaultTerms),
  };
}

function fromSequence(s: Raw): FollowUpSequence {
  return {
    id: str(s.id),
    name: str(s.name),
    triggerStatus: s.triggerStatus as FollowUpSequence['triggerStatus'],
    steps: Array.isArray(s.steps) ? (s.steps as FollowUpSequence['steps']) : [],
    isActive: Boolean(s.isActive),
  };
}

/**
 * Re-read the agency's settings and the signed-in user's own locale and time zone, then make them the active
 * display locale. Called after either is saved. Never throws: on failure the previous locale stays.
 */
export async function refreshLocaleFromServer(): Promise<void> {
  try {
    const [company, me] = await Promise.all([
      client.get<ApiResponse<Record<string, string | null>>>(API_ENDPOINTS.settings.company),
      client.get<ApiResponse<{ locale?: string | null; timezone?: string | null }>>(API_ENDPOINTS.users.me),
    ]);
    const c = company.data ?? {};
    const u = me.data ?? {};
    const resolved = {
      currency: c.currency || undefined,
      locale: u.locale || c.locale || undefined,
      timeZone: u.timezone || c.timezone || c.company_timezone || undefined,
      country: c.country || c.company_country || undefined,
      phoneDefaultCountry: c.phone_default_country || undefined,
    };
    setLocaleContext(resolved);
    const tenant = useAuthStore.getState().tenant;
    if (tenant) {
      useAuthStore.getState().setTenant({
        ...tenant,
        ...(resolved.currency ? { currency: resolved.currency as typeof tenant.currency } : {}),
        ...(resolved.timeZone ? { timezone: resolved.timeZone } : {}),
        ...(resolved.locale ? { locale: resolved.locale } : {}),
        ...(resolved.country ? { country: resolved.country } : {}),
        ...(resolved.phoneDefaultCountry ? { phoneDefaultCountry: resolved.phoneDefaultCountry } : {}),
      });
    }
  } catch {
    // keep showing the locale we already have
  }
}

export const settingsApi = {
  /** The signed-in user's own display overrides; null clears one so the agency setting applies again. */
  myLocale: {
    update: async (data: { locale?: string | null; timezone?: string | null }) => {
      const res = await client.put<ApiResponse<{ locale: string | null; timezone: string | null }>>(API_ENDPOINTS.users.me, data);
      await refreshLocaleFromServer();
      return res;
    },
  },

  company: {
    get: async () =>
      mapData(await client.get<ApiResponse<Record<string, string | null>>>(API_ENDPOINTS.settings.company), fromCompanyKeys),

    update: async (data: UpdateCompanySettingsRequest) => {
      const res = await client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.company, toCompanyKeys(data));
      await refreshLocaleFromServer();
      return res;
    },
  },

  logo: {
    upload: async (data: UploadLogoRequest) => {
      const formData = new FormData();
      formData.append('logo', data.file);

      return client.post<ApiResponse<Logo>>(API_ENDPOINTS.settings.logo, formData as unknown as Record<string, unknown>);
    },
  },

  assignmentRules: {
    get: () =>
      client.get<ApiResponse<AssignmentRules>>(API_ENDPOINTS.settings.assignmentRules),

    update: (data: AssignmentRules) =>
      client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.assignmentRules, data),
  },

  routingRules: {
    get: () =>
      client.get<ApiResponse<RoutingRule[]>>(API_ENDPOINTS.settings.routingRules),

    update: (data: RoutingRule[]) =>
      client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.routingRules, data),
  },

  followUpSequences: {
    list: async () =>
      mapData(await client.get<ApiResponse<Raw[]>>(API_ENDPOINTS.settings.followUpSequences), (rows) => rows.map(fromSequence)),

    create: (data: CreateFollowUpSequenceRequest) =>
      client.post<ApiResponse<Raw>>(API_ENDPOINTS.settings.followUpSequences, data),

    update: (id: string, data: UpdateFollowUpSequenceRequest) =>
      client.put<ApiResponse<Raw>>(`${API_ENDPOINTS.settings.followUpSequences}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.settings.followUpSequences}/${id}`),
  },

  invoiceDefaults: {
    get: async () =>
      mapData(await client.get<ApiResponse<Raw>>(API_ENDPOINTS.settings.invoiceDefaults), fromInvoiceDefaults),

    update: (data: InvoiceDefaults) =>
      client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.invoiceDefaults, toInvoiceDefaults(data)),
  },

  numberingConfig: {
    get: async () =>
      mapData(await client.get<ApiResponse<Raw>>(API_ENDPOINTS.settings.numbering), fromNumbering),

    update: (data: NumberingConfig) =>
      client.put<ApiResponse<Raw>>(API_ENDPOINTS.settings.numbering, toNumbering(data)),
  },

  itineraryDefaults: {
    get: async () =>
      mapData(await client.get<ApiResponse<Raw>>(API_ENDPOINTS.settings.itineraryDefaults), fromItineraryDefaults),

    update: (data: ItineraryDefaults) =>
      client.put<ApiResponse<Raw>>(API_ENDPOINTS.settings.itineraryDefaults, data),
  },
};

const USER_PAGE_SIZE = 20;

/**
 * Combobox fetcher for picking a team member. GET /users returns the whole
 * team as a bare array and ignores search/page, so filtering and paging
 * happen here.
 */
export async function fetchUserOptions(query: string, page: number): Promise<{ items: User[]; total: number }> {
  const res = await usersApi.list({ limit: 100 });
  const body: unknown = 'data' in res ? res.data : [];
  const all = (Array.isArray(body) ? body : ((body as { data?: User[] } | null)?.data ?? [])) as User[];
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? all.filter((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
    : all;
  return { items: matches.slice((page - 1) * USER_PAGE_SIZE, page * USER_PAGE_SIZE), total: matches.length };
}

export async function resolveUserOption(id: string): Promise<User | null> {
  const res = await usersApi.getById(id);
  return 'data' in res ? res.data : null;
}

// ── Usage and limits (R110) ───────────────────────────────────────────────

export interface UsagePack {
  key: string;
  name: string;
  units: number;
  price: number;
  currency: string;
}

export interface UsageLine {
  key: string;
  channel: string;
  label: string;
  used: number;
  allowance: number;
  percent: number;
  exhausted: boolean;
  state: 'ok' | 'warning' | 'exhausted';
  periodEnd: string;
  addons: UsagePack[];
  upgradeTo: { key: string; name: string; allowance: number } | null;
}

export interface UsageOverview {
  periodKey: string;
  periodEnd: string;
  plan: string;
  lines: UsageLine[];
}

export interface RequestUpgradeInput {
  kind: 'plan' | 'top_up';
  channel?: 'ai' | 'sms' | 'whatsapp' | 'whatsapp_marketing' | 'otp' | 'call_minute' | 'email';
  note?: string;
}

export const usageApi = {
  get: () => client.get<ApiResponse<UsageOverview>>(API_ENDPOINTS.settings.usage),
  requestUpgrade: (data: RequestUpgradeInput) =>
    client.post<ApiResponse<{ requested: boolean; delivered: boolean }>>(API_ENDPOINTS.settings.requestUpgrade, data),
};
