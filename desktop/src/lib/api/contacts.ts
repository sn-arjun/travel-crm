import { client, type ApiResponse, type PaginatedResponse } from './client';
import { camelizeKeys, unwrapList } from './envelope';
import { API_ENDPOINTS } from './config';
import type { Contact } from '@travelcrm/shared';

export interface CreateContactRequest {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string;
  type: 'customer' | 'supplier' | 'agent' | 'partner';
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  /** GSTIN / VAT number of a business customer. */
  taxId?: string;
  isBusiness?: boolean;
  tags?: string[];
  notes?: string;
  source?: string;
  birthday?: string;
  anniversary?: string;
  preferredLanguage?: string;
  customFields?: Record<string, unknown>;
  /** Consent the contact gave when the record was created (recorded in the consent history). */
  consent?: { marketing?: Array<'email' | 'whatsapp' | 'sms' | 'call' | 'any'>; source?: 'form' | 'manual' | 'chatbot'; evidence?: Record<string, unknown> };
}

export interface UpdateContactRequest {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  type?: 'customer' | 'supplier' | 'agent' | 'partner';
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  taxId?: string | null;
  isBusiness?: boolean;
  tags?: string[];
  notes?: string | null;
  source?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  preferredLanguage?: string;
  customFields?: Record<string, unknown>;
}

export interface CheckDuplicateRequest {
  email?: string;
  phone?: string;
  name?: string;
}

export interface DuplicateContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  matchScore: number;
}

export interface MergeContactRequest {
  primaryId: string;
  secondaryId: string;
  mergeFields?: Record<string, 'primary' | 'secondary'>;
}

export interface ShareContactRequest {
  userId: string;
  note?: string;
}

/** One row of GET /contacts/:id/timeline (leads, invoices, payments, messages and audit activity). */
export interface ContactTimeline {
  id: string;
  type: 'lead' | 'invoice' | 'payment' | 'message' | 'activity' | (string & {});
  title: string;
  description?: string | null;
  /** Raw detail: a status for leads/invoices, a JSON blob for activity rows. */
  metadata?: string | null;
  createdAt: string;
  createdByName?: string | null;
}

/** A contact as returned by GET /contacts/:id (shared Contact plus detail-only fields). */
export interface ContactRecord extends Contact {
  /** R128: 1 when the email address hard-bounced; sends to it are blocked until the address is corrected. */
  emailUndeliverable?: number | boolean | null;
  emailUndeliverableReason?: string | null;
  emailUndeliverableAt?: string | null;
  postalCode?: string | null;
  taxId?: string | null;
  /** 1 / 0 from the API (or a boolean). */
  isBusiness?: number | boolean | null;
  createdByName?: string | null;
  leadsCount?: number;
  invoicesCount?: number;
  /** Sum of payments received from this contact. */
  paymentsTotal?: number;
  customFields?: Record<string, string>;
}

export interface RelatedLead {
  id: string;
  title: string;
  destinations?: string[];
  travelDate?: string | null;
  budget?: number | null;
  currency?: string | null;
  status: string;
  priority?: string | null;
  assignedToName?: string | null;
}

export interface RelatedItinerary {
  id: string;
  title: string;
  status: string;
  daysCount?: number | null;
  grandTotal?: number | null;
  currency?: string | null;
  leadTitle?: string | null;
}

export interface RelatedInvoice {
  id: string;
  invoiceNumber: string;
  total?: number | null;
  currency?: string | null;
  status: string;
  dueDate?: string | null;
  createdAt?: string | null;
}

export interface RelatedPayment {
  id: string;
  amount: number;
  currency?: string | null;
  method?: string | null;
  reference?: string | null;
  date?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export interface RelatedDocument {
  id: string;
  name: string;
  category?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string | null;
}

export interface RelatedFollowUp {
  id: string;
  leadId: string;
  leadTitle?: string | null;
  type: string;
  notes?: string | null;
  scheduledAt: string;
  completedAt?: string | null;
  status?: string | null;
}

/** Fetches one page of a related collection, filtered server-side by contactId. */
async function fetchRelated<T>(
  endpoint: string,
  contactId: string,
  params: Record<string, string | number | undefined> = {},
  limit = 20,
): Promise<PaginatedResponse<T>> {
  const res = await client.get<unknown>(endpoint, { params: { contactId, limit, ...params } });
  return unwrapList<T>(camelizeKeys(res));
}

export interface CustomFieldDef {
  id: string;
  name: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'boolean';
  options?: string[] | null;
  isRequired?: boolean;
}

export interface CreateCustomFieldRequest {
  name: string;
  label: string;
  fieldType: CustomFieldDef['fieldType'];
  options?: string[];
  isRequired?: boolean;
}

export interface ConsentRecord {
  id: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'call' | 'any';
  purpose: 'marketing' | 'service' | 'recording';
  status: 'granted' | 'withdrawn';
  source: string;
  capturedAt: string;
  capturedByName?: string | null;
}

export interface PrivacyExportResult {
  key: string;
  downloadPath: string;
  expiresAt: string;
  summary: Record<string, number>;
  fileCount: number;
}

export interface EraseResult {
  alreadyErased: boolean;
  anonymisedAs: string;
  filesDeleted: number;
}

export const ERASE_CONFIRMATION_PHRASE = 'ERASE CONTACT';

export const contactsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    tag?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Contact>>>(API_ENDPOINTS.contacts.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<ContactRecord>>(API_ENDPOINTS.contacts.byId(id)),

  create: (data: CreateContactRequest) =>
    client.post<ApiResponse<Contact>>(API_ENDPOINTS.contacts.create, data),

  update: (id: string, data: UpdateContactRequest) =>
    client.put<ApiResponse<Contact>>(API_ENDPOINTS.contacts.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.contacts.byId(id)),

  /** Real related records for the contact detail page - always server-filtered by contactId. */
  related: {
    leads: (contactId: string, params?: { status?: string; limit?: number }) =>
      fetchRelated<RelatedLead>('/leads', contactId, { status: params?.status }, params?.limit ?? 20),
    itineraries: (contactId: string) => fetchRelated<RelatedItinerary>('/itineraries', contactId),
    invoices: (contactId: string) => fetchRelated<RelatedInvoice>('/invoices', contactId),
    payments: (contactId: string) => fetchRelated<RelatedPayment>('/payments', contactId),
    documents: (contactId: string) => fetchRelated<RelatedDocument>('/documents', contactId),
    followUps: async (contactId: string): Promise<PaginatedResponse<RelatedFollowUp>> => {
      // /follow-ups has no paging: it answers with every pending follow-up of the contact's leads.
      const all = await fetchRelated<RelatedFollowUp>('/follow-ups', contactId, {}, 100);
      return { data: all.data.slice(0, 20), pagination: { ...all.pagination, total: all.data.length } };
    },
  },

  /** Consent history, newest first (privacy section of the contact page). */
  getConsents: (id: string) =>
    client.get<ApiResponse<{ history: ConsentRecord[]; current: Record<string, string> }>>(`/contacts/${id}/consents`),

  /** Admin: builds the JSON export and returns a signed link that works for 15 minutes. */
  privacyExport: (id: string) =>
    client.post<ApiResponse<PrivacyExportResult>>(`/contacts/${id}/privacy-export`),

  /** Downloads the file behind a signed export link (needs the signed-in session, so it goes through the API client). */
  downloadExport: (downloadPath: string) =>
    client.get<Blob>(downloadPath.replace(/^\/api\/v1/, ''), { responseType: 'blob' }),

  /** Admin: erases the contact's personal data. `confirmation` must be ERASE_CONFIRMATION_PHRASE. */
  erase: (id: string, confirmation: string) =>
    client.post<ApiResponse<EraseResult>>(`/contacts/${id}/erase`, { confirmation }),

  getTimeline: (id: string) =>
    client.get<ApiResponse<ContactTimeline[]>>(API_ENDPOINTS.contacts.timeline(id)),

  getTags: () =>
    client.get<ApiResponse<string[]>>(API_ENDPOINTS.contacts.tags),

  getFilterOptions: () =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.contacts.filterOptions),

  checkDuplicate: (data: CheckDuplicateRequest) =>
    client.post<ApiResponse<DuplicateContact[]>>(API_ENDPOINTS.contacts.checkDuplicate, data),

  merge: (data: MergeContactRequest) =>
    client.post<ApiResponse<Contact>>(API_ENDPOINTS.contacts.merge, data),

  getMergePreview: (primaryId: string, secondaryId: string) =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.contacts.mergePreview, {
      params: { primaryId, secondaryId },
    }),

  share: (id: string, data: ShareContactRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.contacts.share(id), data),

  getUpcomingOccasions: (params?: { days?: number; limit?: number }) =>
    client.get<ApiResponse<Contact[]>>(API_ENDPOINTS.contacts.upcomingOccasions, { params }),

  getCustomFields: () =>
    client.get<ApiResponse<CustomFieldDef[]>>(API_ENDPOINTS.contacts.customFields),

  createCustomField: (data: CreateCustomFieldRequest) =>
    client.post<ApiResponse<CustomFieldDef>>(API_ENDPOINTS.contacts.customFields, data),

  updateCustomField: (id: string, data: Partial<CreateCustomFieldRequest>) =>
    client.put<ApiResponse<CustomFieldDef>>(API_ENDPOINTS.contacts.customFieldById(id), data),

  deleteCustomField: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.contacts.customFieldById(id)),

  getSharedWithMe: (params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<Contact>>>(API_ENDPOINTS.contacts.sharedWithMe, { params }),

  bulkTag: (data: { contactIds: string[]; tags: string[] }) =>
    client.post<ApiResponse<{ updated: number }>>(API_ENDPOINTS.contacts.bulkTag, data),

  export: (params?: { filters?: Record<string, unknown>; format?: 'csv' | 'xlsx' }) =>
    client.get<Blob>(API_ENDPOINTS.contacts.export, { params: params as Record<string, string | number | boolean>, responseType: 'blob' }),
};
