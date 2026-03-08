import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Aligned with backend sendMessageSchema
export interface SendCommunicationRequest {
  contact_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  message: string;
  subject?: string;
  media_url?: string;
  lead_id?: string;
}

// Aligned with backend sendTemplateSchema
export interface SendTemplateRequest {
  contact_id: string;
  template_id: string;
  variables?: Record<string, string>;
  lead_id?: string;
}

// Aligned with backend sendDocumentSchema
export interface SendDocumentRequest {
  contact_id: string;
  channel: 'whatsapp' | 'email';
  document_type: 'itinerary' | 'invoice' | 'voucher';
  document_id: string;
  caption?: string;
}

// Aligned with backend bulkSendSchema
export interface BulkSendRequest {
  channel: 'email' | 'sms' | 'whatsapp';
  contact_ids: string[];
  template_id?: string;
  message?: string;
  subject?: string;
}

export interface CommunicationLog {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'call';
  type?: 'email' | 'sms' | 'whatsapp' | 'call'; // alias for channel
  contactId?: string;
  recipient?: string;
  subject?: string;
  message?: string;
  content?: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  direction?: 'inbound' | 'outbound';
  sentAt: string;
  sentBy?: string;
  externalId?: string;
  errorMessage?: string;
}

export const communicationsApi = {
  send: (data: SendCommunicationRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.send, data),

  sendTemplate: (data: SendTemplateRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.sendTemplate, data),

  sendDocument: (data: SendDocumentRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.sendDocument, data),

  bulkSend: (data: BulkSendRequest) =>
    client.post<ApiResponse<{ batch_id: string; queued: number }>>(API_ENDPOINTS.communications.bulkSend, data),

  bulkSendStatus: (batchId: string) =>
    client.get<ApiResponse<{ batch_id: string; status: string; total: number; sent: number; failed: number }>>(
      `${API_ENDPOINTS.communications.bulkSend}/${batchId}/status`,
    ),

  getHistory: (params?: {
    page?: number;
    limit?: number;
    channel?: string;
    contact_id?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<CommunicationLog>>>(API_ENDPOINTS.communications.history, { params }),

  getLog: (params?: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    sentBy?: string;
    contactId?: string;
    leadId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<CommunicationLog>>>(API_ENDPOINTS.communications.log, { params }),
};
