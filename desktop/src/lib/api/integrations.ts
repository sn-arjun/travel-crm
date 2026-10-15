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

export type PaymentGatewayId = 'razorpay' | 'stripe';

/** The agency's own Razorpay or Stripe account. Keys are never returned: only whether they are set and their last 4 characters. */
export interface PaymentGatewayAccount {
  gateway: PaymentGatewayId;
  mode: 'test' | 'live';
  isActive: boolean;
  keyConfigured: boolean;
  keyIdLast4: string | null;
  secretLast4: string | null;
  webhookSecretConfigured: boolean;
  lastTestedAt: string | null;
  /** Paste this into the gateway's dashboard as the webhook URL. */
  webhookUrl: string | null;
}

export interface SavePaymentGatewayRequest {
  mode: 'test' | 'live';
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  isActive?: boolean;
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

  listPaymentGateways: () =>
    client.get<ApiResponse<{ accounts: PaymentGatewayAccount[] }>>(API_ENDPOINTS.integrations.paymentGateways),

  savePaymentGateway: (gateway: PaymentGatewayId, data: SavePaymentGatewayRequest) =>
    client.put<ApiResponse<PaymentGatewayAccount>>(API_ENDPOINTS.integrations.paymentGatewayById(gateway), data),

  testPaymentGateway: (gateway: PaymentGatewayId) =>
    client.post<ApiResponse<{ ok: boolean; message: string }>>(API_ENDPOINTS.integrations.paymentGatewayTest(gateway)),

  removePaymentGateway: (gateway: PaymentGatewayId) =>
    client.delete<ApiResponse<{ deleted: boolean }>>(API_ENDPOINTS.integrations.paymentGatewayById(gateway)),

  revokeApiKey: (id: string) =>
    client.delete<ApiResponse<{ revoked: boolean }>>(API_ENDPOINTS.integrations.apiKeyById(id)),
};
