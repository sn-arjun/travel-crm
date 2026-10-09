import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Aligned with backend sendMessageSchema
export interface SendCommunicationRequest {
  contact_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  message: string;
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
  channel: 'whatsapp' | 'sms' | 'email';
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
  /** The API stores 'incoming' / 'outgoing'; older callers used 'inbound' / 'outbound'. */
  direction?: 'incoming' | 'outgoing' | 'inbound' | 'outbound';
  /** Received messages: sender phone or email, present even when no contact matches. */
  fromAddress?: string | null;
  toAddress?: string | null;
  /** JSON string; received messages carry the sender's profile name as from_name. */
  metadata?: string | null;
  leadId?: string | null;
  sentAt?: string | null;
  createdAt?: string;
  sentBy?: string;
  externalId?: string;
  errorMessage?: string;
}

/** True for a message the customer sent to us. */
export function isIncomingMessage(log: Pick<CommunicationLog, 'direction'>): boolean {
  return log.direction === 'incoming' || log.direction === 'inbound';
}

/** Who a received message is from when the sender is not a contact yet: profile name and address when both are known. */
export function senderLabel(log: Pick<CommunicationLog, 'fromAddress' | 'metadata'>): string | null {
  let name: string | null = null;
  try {
    const parsed = log.metadata ? (JSON.parse(log.metadata) as { from_name?: unknown }) : null;
    name = typeof parsed?.from_name === 'string' && parsed.from_name.trim() ? parsed.from_name.trim() : null;
  } catch {
    name = null;
  }
  if (name && log.fromAddress) return `${name} · ${log.fromAddress}`;
  return name ?? log.fromAddress ?? null;
}

export const communicationsApi = {
  send: (data: SendCommunicationRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.send, data),

  sendTemplate: (data: SendTemplateRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.sendTemplate, data),

  sendDocument: (data: SendDocumentRequest) =>
    client.post<ApiResponse<{ message_id: string; status: string }>>(API_ENDPOINTS.communications.sendDocument, data),

  bulkSend: (data: BulkSendRequest) =>
    client.post<ApiResponse<{ batch_id: string; total_messages: number; status: string }>>(API_ENDPOINTS.communications.bulkSend, data),

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
