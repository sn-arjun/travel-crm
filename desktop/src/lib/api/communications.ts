import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface SendCommunicationRequest {
  to: string[];
  subject?: string;
  body: string;
  template?: string;
  type?: 'email' | 'sms' | 'whatsapp';
  attachments?: string[];
  customFields?: Record<string, unknown>;
}

export interface SendTemplateRequest {
  recipientIds: string[];
  templateId: string;
  variables?: Record<string, unknown>;
  type?: 'email' | 'sms' | 'whatsapp';
}

export interface SendDocumentRequest {
  to: string[];
  documentId: string;
  message?: string;
  type?: 'email' | 'sms';
}

export interface BulkSendRequest {
  recipients: Array<{
    id: string;
    email?: string;
    phone?: string;
    name?: string;
  }>;
  subject?: string;
  body: string;
  type?: 'email' | 'sms' | 'whatsapp';
}

export interface CommunicationLog {
  id: string;
  type: 'email' | 'sms' | 'whatsapp' | 'call';
  recipient: string;
  subject?: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt: string;
  direction?: 'inbound' | 'outbound';
}

export const communicationsApi = {
  send: (data: SendCommunicationRequest) =>
    client.post<ApiResponse<{ sent: number; failed: number }>>(API_ENDPOINTS.communications.send, data),

  sendTemplate: (data: SendTemplateRequest) =>
    client.post<ApiResponse<{ sent: number; failed: number }>>(API_ENDPOINTS.communications.sendTemplate, data),

  sendDocument: (data: SendDocumentRequest) =>
    client.post<ApiResponse<{ sent: number; failed: number }>>(API_ENDPOINTS.communications.sendDocument, data),

  bulkSend: (data: BulkSendRequest) =>
    client.post<ApiResponse<{ sent: number; failed: number }>>(API_ENDPOINTS.communications.bulkSend, data),

  getHistory: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    channel?: string;
    contact_id?: string;
    recipient?: string;
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
    type?: string;
    leadId?: string;
    contactId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<CommunicationLog>>>(API_ENDPOINTS.communications.log, { params }),
};
