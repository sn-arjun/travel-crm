import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';

export type ReceivingChannel = 'whatsapp' | 'sms' | 'email' | 'voice';

/** A number or mailbox this workspace receives customer messages on. */
export interface ChannelAddress {
  id: string;
  channel: ReceivingChannel;
  address: string;
  provider: string | null;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateChannelAddressRequest {
  channel: ReceivingChannel;
  address: string;
  provider?: 'twilio' | 'plivo' | 'sendgrid';
  label?: string;
}

/** Website-form API key. The full key is only present in the create response. */
export interface IntegrationApiKey {
  id: string;
  label: string | null;
  maskedKey: string;
  createdAt?: string;
  apiKey?: string;
}

export const integrationsApi = {
  listChannels: () =>
    client.get<ApiResponse<ChannelAddress[]>>(API_ENDPOINTS.integrations.channels),

  addChannel: (data: CreateChannelAddressRequest) =>
    client.post<ApiResponse<ChannelAddress>>(API_ENDPOINTS.integrations.channels, data),

  removeChannel: (id: string) =>
    client.delete<ApiResponse<{ deleted: boolean }>>(API_ENDPOINTS.integrations.channelById(id)),

  listApiKeys: () =>
    client.get<ApiResponse<IntegrationApiKey[]>>(API_ENDPOINTS.integrations.apiKeys),

  createApiKey: (data: { label?: string }) =>
    client.post<ApiResponse<IntegrationApiKey>>(API_ENDPOINTS.integrations.apiKeys, data),

  revokeApiKey: (id: string) =>
    client.delete<ApiResponse<{ revoked: boolean }>>(API_ENDPOINTS.integrations.apiKeyById(id)),
};
