import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface CompanySettings {
  id: string;
  name: string;
  email: string;
  phone: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  logoUrl?: string;
  timezone?: string;
  currency?: string;
  language?: string;
}

export interface Logo {
  id: string;
  url: string;
  uploadedAt: string;
}

export interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  criteria: Record<string, unknown>;
  assignTo: string;
  isActive: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  condition: Record<string, unknown>;
  destination: string;
  isActive: boolean;
}

export interface FollowUpSequence {
  id: string;
  name: string;
  description?: string;
  steps: Array<{
    order: number;
    delayDays: number;
    type: 'email' | 'sms' | 'call' | 'task';
    message?: string;
    template?: string;
  }>;
  isActive: boolean;
}

export interface UpdateCompanySettingsRequest {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  language?: string;
}

export interface UploadLogoRequest {
  file: File;
}

export interface CreateAssignmentRuleRequest {
  name: string;
  priority: number;
  criteria: Record<string, unknown>;
  assignTo: string;
  isActive?: boolean;
}

export interface UpdateAssignmentRuleRequest {
  name?: string;
  priority?: number;
  criteria?: Record<string, unknown>;
  assignTo?: string;
  isActive?: boolean;
}

export interface CreateRoutingRuleRequest {
  name: string;
  priority: number;
  condition: Record<string, unknown>;
  destination: string;
  isActive?: boolean;
}

export interface UpdateRoutingRuleRequest {
  name?: string;
  priority?: number;
  condition?: Record<string, unknown>;
  destination?: string;
  isActive?: boolean;
}

export interface CreateFollowUpSequenceRequest {
  name: string;
  description?: string;
  steps: Array<{
    order: number;
    delayDays: number;
    type: 'email' | 'sms' | 'call' | 'task';
    message?: string;
    template?: string;
  }>;
  isActive?: boolean;
}

export interface UpdateFollowUpSequenceRequest {
  name?: string;
  description?: string;
  steps?: Array<{
    order: number;
    delayDays: number;
    type: 'email' | 'sms' | 'call' | 'task';
    message?: string;
    template?: string;
  }>;
  isActive?: boolean;
}

export interface InvoiceDefaults {
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  accountHolderName?: string;
  upiId?: string;
  defaultCurrency?: string;
  defaultTaxSystem?: string;
  defaultPaymentTerms?: number;
  defaultNotes?: string;
  defaultTerms?: string;
}

export interface NumberingConfig {
  invoicePrefix?: string;
  proformaPrefix?: string;
  receiptPrefix?: string;
  creditNotePrefix?: string;
  debitNotePrefix?: string;
  voucherPrefix?: string;
  fyStartMonth?: number;
  resetYearly?: boolean;
}

export interface ItineraryDefaults {
  defaultValidityDays?: number;
  defaultTerms?: string;
  defaultNotes?: string;
  defaultInclusions?: string;
  defaultExclusions?: string;
  showPricePerPerson?: boolean;
}

export const settingsApi = {
  company: {
    get: () =>
      client.get<ApiResponse<CompanySettings>>(API_ENDPOINTS.settings.company),

    update: (data: UpdateCompanySettingsRequest) =>
      client.put<ApiResponse<CompanySettings>>(API_ENDPOINTS.settings.company, data),
  },

  logo: {
    upload: async (data: UploadLogoRequest) => {
      const formData = new FormData();
      formData.append('file', data.file);

      return client.post<ApiResponse<Logo>>(API_ENDPOINTS.settings.logo, formData as unknown as Record<string, unknown>);
    },
  },

  assignmentRules: {
    list: () =>
      client.get<ApiResponse<AssignmentRule[]>>(API_ENDPOINTS.settings.assignmentRules),

    create: (data: CreateAssignmentRuleRequest) =>
      client.post<ApiResponse<AssignmentRule>>(API_ENDPOINTS.settings.assignmentRules, data),

    update: (id: string, data: UpdateAssignmentRuleRequest) =>
      client.put<ApiResponse<AssignmentRule>>(`${API_ENDPOINTS.settings.assignmentRules}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.settings.assignmentRules}/${id}`),
  },

  routingRules: {
    list: () =>
      client.get<ApiResponse<RoutingRule[]>>(API_ENDPOINTS.settings.routingRules),

    create: (data: CreateRoutingRuleRequest) =>
      client.post<ApiResponse<RoutingRule>>(API_ENDPOINTS.settings.routingRules, data),

    update: (id: string, data: UpdateRoutingRuleRequest) =>
      client.put<ApiResponse<RoutingRule>>(`${API_ENDPOINTS.settings.routingRules}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.settings.routingRules}/${id}`),
  },

  followUpSequences: {
    list: () =>
      client.get<ApiResponse<FollowUpSequence[]>>(API_ENDPOINTS.settings.followUpSequences),

    create: (data: CreateFollowUpSequenceRequest) =>
      client.post<ApiResponse<FollowUpSequence>>(API_ENDPOINTS.settings.followUpSequences, data),

    update: (id: string, data: UpdateFollowUpSequenceRequest) =>
      client.put<ApiResponse<FollowUpSequence>>(`${API_ENDPOINTS.settings.followUpSequences}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.settings.followUpSequences}/${id}`),
  },

  invoiceDefaults: {
    get: () =>
      client.get<ApiResponse<InvoiceDefaults>>(API_ENDPOINTS.settings.invoiceDefaults),

    update: (data: InvoiceDefaults) =>
      client.put<ApiResponse<InvoiceDefaults>>(API_ENDPOINTS.settings.invoiceDefaults, data),
  },

  numberingConfig: {
    get: () =>
      client.get<ApiResponse<NumberingConfig>>(API_ENDPOINTS.settings.numbering),

    update: (data: NumberingConfig) =>
      client.put<ApiResponse<NumberingConfig>>(API_ENDPOINTS.settings.numbering, data),
  },

  itineraryDefaults: {
    get: () =>
      client.get<ApiResponse<ItineraryDefaults>>(API_ENDPOINTS.settings.itineraryDefaults),

    update: (data: ItineraryDefaults) =>
      client.put<ApiResponse<ItineraryDefaults>>(API_ENDPOINTS.settings.itineraryDefaults, data),
  },
};
