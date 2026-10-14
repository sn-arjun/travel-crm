/**
 * VoIP Provider Abstraction Layer
 *
 * Defines a provider-agnostic interface for all VoIP operations.
 * Supports Twilio and Plivo (and future providers).
 */

import type { Env } from '../types';
import { TwilioVoipProvider } from './twilio-voice';
import { PlivoVoipProvider } from './plivo-voice';
import { TwilioMessagingProvider } from './twilio-messaging';
import { PlivoMessagingProvider } from './plivo-messaging';

export { VoipProviderError, escapeXml } from './voip-base';

// ── Shared Types ────────────────────────────────────────────

export type VoipProviderName = 'twilio' | 'plivo';

export interface VoipCallOptions {
  from: string;
  to: string;
  statusCallbackUrl: string;
  recordingCallbackUrl?: string;
  record: boolean;
  machineDetection?: boolean;
  timeout?: number;
}

export interface VoipCallResult {
  providerCallId: string;  // Twilio CallSid or Plivo CallUUID
  status: string;
  direction: string;
  from: string;
  to: string;
}

export interface VoipAvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  region?: string;
  capabilities: { voice: boolean; sms: boolean };
  monthlyPrice?: number;
}

export interface VoipPurchasedNumber {
  providerNumberId: string;  // Twilio SID or Plivo UUID
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean };
}

export interface VoipClientToken {
  token: string;
  identity: string;
  expiresIn: number;  // seconds
}

export interface IvrOption {
  digit: string;
  label: string;
  action: string;   // 'dial', 'queue', 'voicemail', 'submenu'
  target: string;    // phone number, queue name, etc.
}

export interface VoipProviderCredentials {
  accountId: string;
  authToken: string;
  apiKeyId?: string;
  apiKeySecret?: string;
  appId?: string;         // Twilio TwiML App SID or Plivo App ID
}

/** Generalized VoIP settings read from DB row */
export interface VoipSettingsRow {
  id: string;
  voipProvider: VoipProviderName;
  // Generic provider credentials
  providerAccountId: string | null;
  providerAuthToken: string | null;
  providerApiKeyId: string | null;
  providerApiKeySecret: string | null;
  providerAppId: string | null;
  // Legacy Twilio-specific (for backward compat)
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioApiKeySid: string | null;
  twilioApiKeySecret: string | null;
  twilioTwimlAppSid: string | null;
  // Common settings
  defaultCallerId: string | null;
  recordingPolicy: string;
  ivrEnabled: number;
  ivrConfig: string | null;
  businessHoursEnabled: number;
  businessHours: string | null;
  voicemailEnabled: number;
  voicemailGreetingUrl: string | null;
  maxRingDuration: number;
  routingStrategy: string;
  autoCreateLeadMissedCall: number;
  recordingRetentionDays: number;
  recordingStorageBytes: number;
}

// ── VoIP Provider Interface ─────────────────────────────────

export interface VoipProvider {
  readonly providerName: VoipProviderName;

  // Call management
  initiateCall(options: VoipCallOptions): Promise<VoipCallResult>;
  endCall(providerCallId: string): Promise<void>;
  holdCall(providerCallId: string, hold: boolean): Promise<void>;
  transferCall(providerCallId: string, targetNumber: string): Promise<void>;
  getCallDetails(providerCallId: string): Promise<any>;

  // Phone number management
  searchAvailableNumbers(country: string, areaCode?: string, contains?: string): Promise<VoipAvailableNumber[]>;
  purchaseNumber(phoneNumber: string, friendlyName?: string, webhookBaseUrl?: string): Promise<VoipPurchasedNumber>;
  releaseNumber(providerNumberId: string): Promise<void>;

  // Client token for browser/app calling
  generateClientToken(userId: string): Promise<VoipClientToken>;

  // Call response markup (XML) generation
  generateDialMarkup(number: string, callerId: string, record: boolean): string;
  generateClientDialMarkup(clientIdentity: string, callerId: string, record: boolean): string;
  generateIvrMarkup(greeting: string, options: IvrOption[], actionUrl: string): string;
  generateVoicemailMarkup(recordingCallbackUrl: string, greetingUrl?: string): string;
  generateTransferMarkup(targetNumber: string, callerId: string): string;
  generateHangupMarkup(message?: string): string;
  generateEmptyResponse(): string;

  // Webhook signature validation
  validateWebhookSignature(url: string, params: Record<string, string>, signature: string): Promise<boolean>;

  // Connection test
  testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }>;
}

// ── Messaging Provider Interface ────────────────────────────

export interface MessageResult {
  providerMessageId: string;
  status: string;
  to: string;
  channel: 'sms' | 'whatsapp';
}

export interface MessagingProvider {
  readonly providerName: VoipProviderName;
  sendSms(to: string, message: string): Promise<MessageResult>;
  sendWhatsApp(to: string, message: string, mediaUrl?: string): Promise<MessageResult>;
  sendWhatsAppTemplate(to: string, templateId: string, variables: Record<string, string>): Promise<MessageResult>;
}

// ── Provider Error ──────────────────────────────────────────

// ── Factory ─────────────────────────────────────────────────

/**
 * Resolve credentials from DB row, handling backward compat:
 * - If generic provider_* fields are set, use them.
 * - If not, fall back to twilio_* fields (legacy).
 */
export function resolveCredentials(settings: VoipSettingsRow): VoipProviderCredentials {
  return {
    accountId: settings.providerAccountId || settings.twilioAccountSid || '',
    authToken: settings.providerAuthToken || settings.twilioAuthToken || '',
    apiKeyId: settings.providerApiKeyId || settings.twilioApiKeySid || undefined,
    apiKeySecret: settings.providerApiKeySecret || settings.twilioApiKeySecret || undefined,
    appId: settings.providerAppId || settings.twilioTwimlAppSid || undefined,
  };
}

/**
 * Create a VoIP provider instance based on the tenant's settings.
 */
export function createVoipProvider(env: Env, settings: VoipSettingsRow): VoipProvider {
  const provider = settings.voipProvider || 'twilio';
  const creds = resolveCredentials(settings);

  if (provider === 'plivo') {
    // Plivo is dropped (owner decision 2026-10-14); kept compiling only.
        return new PlivoVoipProvider(creds, settings);
  }

  // Default: Twilio (with env fallback)
  const twilioEnv = {
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
  };
  return new TwilioVoipProvider(twilioEnv, settings);
}

/**
 * Create a messaging provider instance.
 */
export function createMessagingProvider(env: Env, provider: VoipProviderName = 'twilio'): MessagingProvider {
  if (provider === 'plivo') {
    return new PlivoMessagingProvider(env);
  }

  return new TwilioMessagingProvider(env);
}

