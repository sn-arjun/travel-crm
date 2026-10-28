/**
 * VoIP Provider Abstraction Layer
 *
 * Defines a provider-agnostic interface for all VoIP operations.
 * Supports Twilio and Plivo (and future providers).
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '../types';
import { error } from '../utils/response';
import { CredentialDecryptError, CredentialsKeyMissing, decryptColumn, encryptSecret } from '../utils/crypto-box';
import { TwilioVoipProvider } from './twilio-voice';
import { PlivoVoipProvider } from './plivo-voice';
import { MockVoipProvider } from './voip/mock-provider';
import type { PromptLanguage } from './voip/prompts';
import { isTestMode } from '../utils/test-mode';
import type {
  VoipSubAccountInput, VoipSubAccount, VoipPlaceCallOptions, VoipFetchUsageInput, VoipUsageRecord,
  VoipRecordingRef, VoipRecordingFile, VoipProviderDeps, VoipRegulatoryInput, VoipRegulatoryResult, VoipRegulatoryStatus,
} from './voip/contract';
import { TwilioMessagingProvider } from './twilio-messaging';
import { PlivoMessagingProvider } from './plivo-messaging';

export { VoipProviderError, NotImplementedForProvider, escapeXml, voipClientIdentity, errorKindForStatus } from './voip-base';
export type { VoipErrorKind } from './voip-base';
export * from './voip/contract';

// ── Shared Types ────────────────────────────────────────────

export type VoipProviderName = 'twilio' | 'plivo' | 'mock';

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

  // ── Reselling contract (R301). Adapters throw NotImplementedForProvider for what they do not support yet;
  //    R304 sub-accounts + numbers, R305 usage, R306 recordings, R307 softphone token fill the Twilio side.
  /** Platform credentials only. Creates the agency's sub-account; the token comes back sealed. */
  createSubAccount(input: VoipSubAccountInput): Promise<VoipSubAccount>;
  /** Platform credentials only. Closes the sub-account (the provider releases its numbers). */
  closeSubAccount(subAccountId: string): Promise<void>;
  /** Platform credentials only. Suspends (calls and numbers stop working, numbers are kept) or reactivates the sub-account. */
  setSubAccountStatus(subAccountId: string, status: 'active' | 'suspended'): Promise<void>;
  /** Place a call from the agency's account: agent leg first (app or phone), then the customer. */
  placeCall(options: VoipPlaceCallOptions): Promise<VoipCallResult>;
  /** Platform credentials only. Calls the sub-account made or received since a time, normalised. */
  fetchUsage(input: VoipFetchUsageInput): Promise<VoipUsageRecord[]>;
  /** The identity rule shared by tokens and ring markup: voipClientIdentity(userId). */
  clientIdentity(userId: string): string;
  /** Download a recording's audio. */
  fetchRecording(ref: VoipRecordingRef): Promise<VoipRecordingFile>;
  /** Delete a recording at the provider (R306): called once the copy in our own storage is safely written. Deleting one that is already gone succeeds. */
  deleteRecording(ref: VoipRecordingRef): Promise<void>;
  /** Start recording a call in progress (R306): used when the agency's policy is 'on request' and the agent has the caller's consent. */
  startRecording(providerCallId: string, callbackBaseUrl: string): Promise<void>;

  // Call management (initiateCall is kept for existing routes; placeCall is the contract)
  initiateCall(options: VoipCallOptions): Promise<VoipCallResult>;
  endCall(providerCallId: string): Promise<void>;
  holdCall(providerCallId: string, hold: boolean): Promise<void>;
  transferCall(providerCallId: string, targetNumber: string): Promise<void>;
  getCallDetails(providerCallId: string): Promise<any>;

  // Phone number management
  searchAvailableNumbers(country: string, areaCode?: string, contains?: string): Promise<VoipAvailableNumber[]>;
  /** R137: a country with a regulatory bundle passes the approved bundle and address with the purchase. */
  purchaseNumber(phoneNumber: string, friendlyName?: string, webhookBaseUrl?: string, regulatory?: { bundleSid: string; addressSid: string }): Promise<VoipPurchasedNumber>;
  releaseNumber(providerNumberId: string): Promise<void>;

  /** R137: submit the agency's business identity, address and documents for review (optional; see contract.ts). Acts as the agency's sub-account. */
  submitRegulatoryBundle?(input: VoipRegulatoryInput): Promise<VoipRegulatoryResult>;
  /** R137: where a submitted bundle stands. */
  getRegulatoryBundleStatus?(bundleSid: string): Promise<VoipRegulatoryStatus>;

  // Client token for browser/app calling
  generateClientToken(userId: string, opts?: { ttlSeconds?: number }): Promise<VoipClientToken>;
  /** R307: create the key that signs softphone tokens inside the account this provider acts as. Only the Twilio adapter has it. */
  provisionSoftphoneKey?(friendlyName?: string): Promise<{ apiKeyId: string; apiKeySecret: string }>;

  // Call response markup (XML) generation
  generateDialMarkup(number: string, callerId: string, record: boolean): string;
  /** Ring an agent. With actionUrl the provider calls it when the dial ends (answered or not), so a no-answer reaches the fallback. */
  generateClientDialMarkup(clientIdentity: string, callerId: string, record: boolean, opts?: { actionUrl?: string; timeout?: number; announcement?: string; language?: PromptLanguage }): string;
  /** R137: the optional language picks the voice and the wording of the fixed prompts (services/voip/prompts.ts); none = English as before. */
  generateIvrMarkup(greeting: string, options: IvrOption[], actionUrl: string, language?: PromptLanguage): string;
  generateVoicemailMarkup(recordingCallbackUrl: string, greetingUrl?: string, language?: PromptLanguage): string;
  generateTransferMarkup(targetNumber: string, callerId: string): string;
  generateHangupMarkup(message?: string, language?: PromptLanguage): string;
  generateEmptyResponse(): string;

  // Webhook signature validation
  validateWebhookSignature(url: string, params: Record<string, string>, signature: string): Promise<boolean>;

  // Connection test
  testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }>;
}

// ── Messaging Provider Interface ────────────────────────────

/** Meta's pricing category of a WhatsApp message: 'service' is a free-form reply inside the 24 hour window (free). */
export type WhatsAppCategory = 'service' | 'utility' | 'marketing' | 'authentication';

export interface MessageResult {
  providerMessageId: string;
  status: string;
  to: string;
  channel: 'sms' | 'whatsapp';
  /** Set by providers that report why a send failed (Meta). */
  error?: string;
  errorKind?: 'auth' | 'window' | 'rate_limited' | 'invalid_request' | 'provider';
  category?: WhatsAppCategory;
}

/** Template details a provider that sends approved templates (Meta) needs; Twilio and Plivo ignore them. */
export interface WhatsAppTemplateOptions {
  language?: string;
  category?: WhatsAppCategory;
  /** Header image/document/video URL when the approved template has a media header. */
  headerMediaUrl?: string;
}

export type MessagingProviderName = VoipProviderName | 'meta';

export interface MessagingProvider {
  readonly providerName: MessagingProviderName;
  sendSms(to: string, message: string): Promise<MessageResult>;
  sendWhatsApp(to: string, message: string, mediaUrl?: string): Promise<MessageResult>;
  /** templateId is the provider's template reference: a Twilio content SID, or the approved template name on Meta. */
  sendWhatsAppTemplate(to: string, templateId: string, variables: Record<string, string>, options?: WhatsAppTemplateOptions): Promise<MessageResult>;
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
  const delay = Number(env.MOCK_BUNDLE_DELAY_SECONDS);
  const deps: VoipProviderDeps = {
    sealSecret: (plain, aad) => encryptSecret(env, plain, aad),
    mockBundleDelaySeconds: Number.isFinite(delay) && delay > 0 ? delay : 0,
  };

  // The mock is explicit (VOIP_PROVIDER=mock; never a stored row, whose signed callbacks must stay verifiable) or, in test mode only, the fallback when no
  // credentials exist anywhere. Production can never reach it.
  if (env.ENVIRONMENT !== 'production' && (env.VOIP_PROVIDER === 'mock' || (isTestMode(env) && !creds.accountId && !env.TWILIO_ACCOUNT_SID))) {
    return new MockVoipProvider(settings, deps);
  }

  if (provider === 'plivo') {
    // Plivo is dropped (owner decision 2026-10-14); kept compiling only.
    return new PlivoVoipProvider(creds, settings);
  }

  // Default: Twilio (with env fallback)
  const twilioEnv = {
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
  };
  return new TwilioVoipProvider(twilioEnv, settings, deps);
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


// ── Stored settings (credentials encrypted at rest, R108) ───

/** The four credential columns of voip_settings; stored as enc:v1 values, never plaintext. */
export const VOIP_SECRET_COLUMNS = [
  'provider_auth_token',
  'provider_api_key_secret',
  'twilio_auth_token',
  'twilio_api_key_secret',
] as const;
export type VoipSecretColumn = (typeof VOIP_SECRET_COLUMNS)[number];

/**
 * Additional authenticated data of a stored credential: the settings row (one per workspace database, with
 * a unique id) and the column, so a ciphertext copied to another row or column does not open.
 */
export function voipSecretAad(rowId: string, column: VoipSecretColumn): string {
  return `${rowId}:voip_settings.${column}`;
}

/** Seal a credential for a column of a voip_settings row. Null and empty clear the column. */
export async function sealVoipSecret(env: Env, rowId: string, column: VoipSecretColumn, value: string | null): Promise<string | null> {
  if (!value) return value ?? null;
  return encryptSecret(env, value, voipSecretAad(rowId, column));
}

/**
 * The one reader of voip_settings: every route, callback and provider gets credentials decrypted through
 * here. Legacy plaintext values pass through unchanged until they are re-encrypted. Throws
 * CredentialsKeyMissing when a stored credential cannot be opened for lack of a key.
 */
export async function loadVoipSettings(env: Env, db: D1Database): Promise<VoipSettingsRow | null> {
  const row = await db.prepare('SELECT * FROM voip_settings LIMIT 1').first<any>();
  if (!row) return null;
  const secret = (column: VoipSecretColumn) => decryptColumn(env, row[column], voipSecretAad(row.id, column));
  return {
    id: row.id,
    voipProvider: row.voip_provider || 'twilio',
    providerAccountId: row.provider_account_id,
    providerAuthToken: await secret('provider_auth_token'),
    providerApiKeyId: row.provider_api_key_id,
    providerApiKeySecret: await secret('provider_api_key_secret'),
    providerAppId: row.provider_app_id,
    twilioAccountSid: row.twilio_account_sid,
    twilioAuthToken: await secret('twilio_auth_token'),
    twilioApiKeySid: row.twilio_api_key_sid,
    twilioApiKeySecret: await secret('twilio_api_key_secret'),
    twilioTwimlAppSid: row.twilio_twiml_app_sid,
    defaultCallerId: row.default_caller_id,
    recordingPolicy: row.recording_policy || 'all',
    ivrEnabled: row.ivr_enabled || 0,
    ivrConfig: row.ivr_config,
    businessHoursEnabled: row.business_hours_enabled || 0,
    businessHours: row.business_hours,
    voicemailEnabled: row.voicemail_enabled ?? 1,
    voicemailGreetingUrl: row.voicemail_greeting_url,
    maxRingDuration: row.max_ring_duration || 30,
    routingStrategy: row.routing_strategy || 'assigned',
    autoCreateLeadMissedCall: row.auto_create_lead_missed_call ?? 1,
    recordingRetentionDays: row.recording_retention_days ?? 90,
    recordingStorageBytes: row.recording_storage_bytes ?? 0,
  };
}

/** Error handler for routers that read credentials: a missing key is 503 CREDENTIALS_UNAVAILABLE, nothing else changes. */
export function credentialsAwareErrorHandler(err: Error, c: Context): Response {
  if (err instanceof CredentialsKeyMissing || err instanceof CredentialDecryptError) {
    console.error('[voip] credentials unavailable:', err.name);
    return error(c, 'Stored credentials are unavailable. Contact support.', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
  }
  if (err instanceof HTTPException) {
    return error(c, err.status >= 500 ? 'Internal server error' : err.message || 'Bad request', err.status);
  }
  console.error('Unhandled error:', err);
  return error(c, 'Internal server error', 500);
}
