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

/** 'mock' is the test gateway: only offered where the API says mockAvailable (local and test stacks, never production). */
export type PaymentGatewayId = 'razorpay' | 'stripe' | 'mock';

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
  /** Not needed for the test gateway. */
  mode?: 'test' | 'live';
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  isActive?: boolean;
}

export type WhatsAppProviderId = 'twilio' | 'meta';

/** The agency's WhatsApp number on Meta's Cloud API. The token and app secret are never returned: only whether they are set. */
export interface WhatsAppMetaAccount {
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  isActive: boolean;
  tokenConfigured: boolean;
  tokenLast4: string | null;
  appSecretConfigured: boolean;
  lastTestedAt: string | null;
}

export interface WhatsAppSettings {
  /** The provider WhatsApp messages go through now. */
  provider: WhatsAppProviderId;
  /** False while the default applies (the agency never chose). */
  providerExplicit: boolean;
  /** The platform can send on Meta with its own number. */
  platformConfigured: boolean;
  platformTokenAvailable: boolean;
  account: WhatsAppMetaAccount | null;
  /** Paste into the Meta app's WhatsApp configuration as the callback URL. */
  webhookUrl: string;
  /** Paste into the Meta app's WhatsApp configuration as the verify token. */
  verifyToken: string | null;
}

export interface SaveWhatsAppMetaRequest {
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  accessToken?: string;
  appSecret?: string;
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
    client.get<ApiResponse<{ accounts: PaymentGatewayAccount[]; mockAvailable?: boolean }>>(API_ENDPOINTS.integrations.paymentGateways),

  savePaymentGateway: (gateway: PaymentGatewayId, data: SavePaymentGatewayRequest) =>
    client.put<ApiResponse<PaymentGatewayAccount>>(API_ENDPOINTS.integrations.paymentGatewayById(gateway), data),

  testPaymentGateway: (gateway: PaymentGatewayId) =>
    client.post<ApiResponse<{ ok: boolean; message: string }>>(API_ENDPOINTS.integrations.paymentGatewayTest(gateway)),

  removePaymentGateway: (gateway: PaymentGatewayId) =>
    client.delete<ApiResponse<{ deleted: boolean }>>(API_ENDPOINTS.integrations.paymentGatewayById(gateway)),

  getWhatsApp: () =>
    client.get<ApiResponse<WhatsAppSettings>>(API_ENDPOINTS.integrations.whatsapp),

  setWhatsAppProvider: (provider: WhatsAppProviderId) =>
    client.put<ApiResponse<WhatsAppSettings>>(API_ENDPOINTS.integrations.whatsappProvider, { provider }),

  saveWhatsAppMeta: (data: SaveWhatsAppMetaRequest) =>
    client.put<ApiResponse<WhatsAppSettings>>(API_ENDPOINTS.integrations.whatsappMeta, data),

  testWhatsAppMeta: () =>
    client.post<ApiResponse<{ ok: boolean; message: string }>>(API_ENDPOINTS.integrations.whatsappMetaTest),

  removeWhatsAppMeta: () =>
    client.delete<ApiResponse<{ deleted: boolean }>>(API_ENDPOINTS.integrations.whatsappMeta),

  revokeApiKey: (id: string) =>
    client.delete<ApiResponse<{ revoked: boolean }>>(API_ENDPOINTS.integrations.apiKeyById(id)),
};
