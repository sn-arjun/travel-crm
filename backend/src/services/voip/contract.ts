// Reselling contract types (R301). The platform resells calls: one provider sub-account per agency, numbers
// bought into it, calls placed from it, usage read back for metering. Everything here is provider-neutral;
// adapters (Twilio, mock, later others) map it onto their API. Type-only, so it imports nothing at runtime.

/** Seals a secret for storage (AES-GCM via crypto-box). Supplied by the factory; adapters never see keys. */
export type VoipSecretSealer = (plain: string, aad: string) => Promise<string>;

export interface VoipSubAccountInput {
  tenantId: string;
  /** Human name shown in the provider console, e.g. the agency name. */
  name: string;
}

export interface VoipSubAccount {
  /** Provider's id for the sub-account (Twilio account SID). */
  subAccountId: string;
  /** Credential id used to authenticate AS the sub-account (Twilio: the SID again). */
  authId: string;
  /** The sub-account auth token sealed for storage. AAD: `voip_sub_account:${tenantId}:${subAccountId}`. Never plaintext. */
  authTokenEnc: string;
}

/** The additional authenticated data a sealed sub-account token must be stored and opened with. */
export function subAccountSecretAad(tenantId: string, subAccountId: string): string {
  return `voip_sub_account:${tenantId}:${subAccountId}`;
}

export type VoipCallMode = 'softphone' | 'bridge';

export interface VoipPlaceCallOptions {
  /**
   * softphone: ring the agent's in-app client (`agentIdentity`), then dial `to` when the agent answers.
   * bridge: ring the agent's own phone (`agentNumber`) first, then dial `to`.
   */
  mode: VoipCallMode;
  /** The agency's number shown to the customer. */
  from: string;
  /** The customer, E.164. */
  to: string;
  agentNumber?: string;
  /** Output of voipClientIdentity(userId). */
  agentIdentity?: string;
  /** Public API origin the provider calls back, no trailing slash, e.g. https://api.example.com */
  callbackBaseUrl: string;
  record: boolean;
  /** R306: TwiML URL played to the customer when they answer, before the agent is connected (the recording announcement). */
  announcementUrl?: string;
  /** Ring timeout in seconds. */
  timeout?: number;
  machineDetection?: boolean;
  /** R305: the provider ends the call by itself after this many seconds (fraud: a call cannot run for ever). Default none. */
  maxDurationSeconds?: number;
}

export type VoipCallDirection = 'inbound' | 'outbound';

/** One billable call as the provider reports it, normalised so metering does not care which provider. */
export interface VoipUsageRecord {
  providerCallId: string;
  direction: VoipCallDirection;
  to: string;
  from: string;
  /** ISO 8601 UTC. */
  startedAt: string;
  durationSeconds: number;
  /** Seconds the provider bills (rounded per its increments). */
  billedSeconds: number;
  /** What the provider charged, as a positive number (providers report it negative); 0 when not yet priced. */
  cost: number;
  currency: string;
  /**
   * R305: which leg of a bridged call this record is. 'agent' = the leg to the agent (their app or phone), never
   * counted as customer minutes; 'customer' = the leg a customer is on; 'dial' = a child leg whose meaning depends on
   * its parent (a child of an inbound call is the agent leg, a child of an outbound call is the customer leg).
   * Absent = 'customer' (one record per call, as the mock reports it).
   */
  leg?: 'agent' | 'customer' | 'dial';
  /** The parent call's id when the provider reports legs as separate calls. */
  parentCallId?: string | null;
}

export interface VoipFetchUsageInput {
  subAccountId: string;
  /** ISO 8601 UTC: only calls started at or after this. */
  since: string;
  /** Safety cap on pages walked. Default 20. */
  maxPages?: number;
}

export interface VoipRecordingRef {
  /** Provider recording id (Twilio RE...). */
  recordingId: string;
  /** Sub-account that owns it; defaults to the provider instance's own account. */
  subAccountId?: string;
}

export interface VoipRecordingFile {
  recordingId: string;
  contentType: string;
  bytes: ArrayBuffer;
  durationSeconds?: number;
}

export interface VoipProviderDeps {
  sealSecret?: VoipSecretSealer;
}
