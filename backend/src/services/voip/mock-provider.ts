/**
 * MockVoipProvider (R301): the whole VoipProvider contract in memory, deterministic, no network.
 *
 * Used when VOIP_PROVIDER=mock, or in test mode when no provider credentials exist anywhere (never in
 * production). It extends the Twilio adapter only for the markup generators and the HMAC-SHA1 webhook check,
 * so the callback routes see exactly the TwiML and signatures they would from Twilio; every method that would
 * touch the network is overridden here.
 *
 * State is module-level (one per isolate) and reset with MockVoipProvider.reset(). Ids are counters, so a
 * test run produces the same ids every time.
 */

import { TwilioVoipProvider } from '../twilio-voice';
import { VoipProviderError, voipClientIdentity } from '../voip-base';
import type {
  VoipAvailableNumber, VoipCallOptions, VoipCallResult, VoipClientToken, VoipPurchasedNumber, VoipSettingsRow,
} from '../voip-provider';
import {
  subAccountSecretAad,
  type VoipFetchUsageInput, type VoipPlaceCallOptions, type VoipProviderDeps, type VoipRecordingFile,
  type VoipRecordingRef, type VoipRegulatoryInput, type VoipRegulatoryResult, type VoipRegulatoryStatus,
  type VoipSubAccount, type VoipSubAccountInput, type VoipUsageRecord,
} from './contract';

/** The token the mock provider signs webhooks with when neither the workspace row nor the environment names one. */
export const MOCK_AUTH_TOKEN = 'mock-auth-token';
/** Searching this area code makes the mock's number search fail (provider-error path in tests and e2e). */
export const MOCK_FAILING_AREA_CODE = '999';

/** Provider call ids the call simulator makes up start with this (services/voip/simulator.ts). */
export const SIMULATED_CALL_PREFIX = 'CAsim';

export interface MockCallRecord {
  providerCallId: string;
  mode: 'initiate' | 'softphone' | 'bridge';
  from: string;
  to: string;
  agentLeg?: string;
  record: boolean;
  callbackBaseUrl?: string;
  status: string;
  ended: boolean;
  held: boolean;
  transferredTo?: string;
  announcementUrl?: string;
  recordingStarted?: boolean;
  maxDurationSeconds?: number;
}

/** A regulatory bundle the mock holds (R137). It is approved (or rejected) once approveAt has passed. */
export interface MockBundle {
  bundleSid: string;
  addressSid: string;
  country: string;
  input: VoipRegulatoryInput;
  approveAt: number;
  /** Set when the bundle will be rejected, with the provider's reason. */
  rejection: string | null;
  /** Forced by a test: overrides the clock. */
  forced: string | null;
}

interface MockState {
  counter: number;
  bundles: Map<string, MockBundle>;
  /** Reason the next submitted bundles are rejected with, null = approve (MockVoipProvider.rejectBundles). */
  rejectBundlesWith: string | null;
  /** Every number purchase that carried a regulatory bundle, in order. */
  bundlePurchases: Array<{ phoneNumber: string; bundleSid: string; addressSid: string }>;
  calls: MockCallRecord[];
  subAccounts: Map<string, { tenantId: string; name: string; closed: boolean; suspended?: boolean }>;
  numbers: Map<string, { providerNumberId: string; phoneNumber: string }>;
  usage: Array<VoipUsageRecord & { subAccountId: string }>;
  recordings: Map<string, { bytes: Uint8Array; durationSeconds: number }>;
  /** Recording ids deleted through deleteRecording, in order. */
  deletedRecordings: string[];
  log: string[];
}

function fresh(): MockState {
  return { counter: 0, bundles: new Map(), rejectBundlesWith: null, bundlePurchases: [], calls: [], subAccounts: new Map(), numbers: new Map(), usage: [], recordings: new Map(), deletedRecordings: [], log: [] };
}

let state: MockState = fresh();

/** 34-character Twilio-style id: two letters then a 32-digit hex counter. */
function nextId(prefix: string): string {
  state.counter += 1;
  return prefix + state.counter.toString(16).padStart(32, '0');
}

const COUNTRY_PREFIX: Record<string, string> = { GB: '+4420300', US: '+1415555', AU: '+6129000', SG: '+65310', DE: '+4930300', MY: '+60312', NL: '+3120300' };

export class MockVoipProvider extends TwilioVoipProvider {
  override readonly providerName = 'mock' as const;

  constructor(private mockSettings: VoipSettingsRow, private mockDeps: VoipProviderDeps = {}) {
    super({ TWILIO_ACCOUNT_SID: 'ACmock', TWILIO_AUTH_TOKEN: MOCK_AUTH_TOKEN }, mockSettings, mockDeps);
  }

  // ── Test helpers (static: state is per isolate, not per instance) ──

  static reset(): void {
    state = fresh();
  }

  static get calls(): readonly MockCallRecord[] {
    return state.calls;
  }

  /** Recording ids the platform asked the provider to delete (R306). */
  static get deletedRecordings(): readonly string[] {
    return state.deletedRecordings;
  }

  static hasRecording(recordingId: string): boolean {
    return state.recordings.has(recordingId);
  }

  static get subAccounts(): ReadonlyMap<string, { tenantId: string; name: string; closed: boolean; suspended?: boolean }> {
    return state.subAccounts;
  }

  /** R137: regulatory bundles submitted to the mock, by sid. */
  static get bundles(): ReadonlyMap<string, MockBundle> {
    return state.bundles;
  }

  /** R137: purchases that carried a bundle and address, in order. */
  static get bundlePurchases(): ReadonlyArray<{ phoneNumber: string; bundleSid: string; addressSid: string }> {
    return state.bundlePurchases;
  }

  /** R137: bundles submitted from now on are rejected with this reason (null goes back to approving them). */
  static rejectBundles(reason: string | null): void {
    state.rejectBundlesWith = reason;
  }

  /** R137: decide a submitted bundle now, whatever the delay ('twilio-approved' or 'twilio-rejected'). */
  static decideBundle(bundleSid: string, status: 'twilio-approved' | 'twilio-rejected', reason: string | null = null): void {
    const bundle = state.bundles.get(bundleSid);
    if (!bundle) throw new VoipProviderError('mock', 'BUNDLE_NOT_FOUND', `No mock bundle ${bundleSid}`, 'not_found');
    bundle.forced = status;
    bundle.rejection = status === 'twilio-rejected' ? reason ?? 'Rejected by the mock provider' : null;
  }

  /** Phone numbers currently held at the provider (bought and not released). */
  static get heldNumbers(): string[] {
    return [...state.numbers.keys()];
  }

  /** Every provider-side action in order ("createSubAccount", "purchaseNumber:+44...", "releaseNumber:PN..."), for tests that check ordering. */
  static get log(): readonly string[] {
    return state.log;
  }

  /** Mark a placed call finished and make it show up in fetchUsage, as Twilio would after the call. */
  static completeCall(
    providerCallId: string,
    durationSeconds: number,
    opts: { subAccountId?: string; direction?: 'inbound' | 'outbound'; startedAt?: string; cost?: number; currency?: string; to?: string; from?: string; leg?: 'agent' | 'customer' | 'dial'; parentCallId?: string } = {},
  ): VoipUsageRecord {
    const call = state.calls.find((c) => c.providerCallId === providerCallId);
    if (!call) throw new VoipProviderError('mock', 'CALL_NOT_FOUND', `No mock call ${providerCallId}`, 'not_found');
    call.status = 'completed';
    call.ended = true;
    const billedSeconds = durationSeconds > 0 ? Math.ceil(durationSeconds / 60) * 60 : 0;
    const record: VoipUsageRecord = {
      providerCallId,
      direction: opts.direction ?? 'outbound',
      to: opts.to ?? call.to,
      from: opts.from ?? call.from,
      startedAt: opts.startedAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, state.counter)).toISOString(),
      durationSeconds,
      billedSeconds,
      cost: opts.cost ?? Math.round((billedSeconds / 60) * 0.014 * 10000) / 10000,
      currency: opts.currency ?? 'USD',
      ...(opts.leg ? { leg: opts.leg } : {}),
      ...(opts.parentCallId ? { parentCallId: opts.parentCallId } : {}),
    };
    state.usage.push({ ...record, subAccountId: opts.subAccountId ?? '' });
    return record;
  }

  /** Put a usage record in front of fetchUsage without a placed call (an inbound call, or a leg). */
  static addUsage(subAccountId: string, record: VoipUsageRecord): void {
    state.usage.push({ ...record, subAccountId });
  }

  /** Put audio behind a recording id so fetchRecording can return it. */
  static addRecording(recordingId: string, bytes: Uint8Array, durationSeconds = 0): void {
    state.recordings.set(recordingId, { bytes, durationSeconds });
  }

  // ── Sub-accounts ──────────────────────────────────────────

  override async createSubAccount(input: VoipSubAccountInput): Promise<VoipSubAccount> {
    const subAccountId = nextId('AC');
    state.log.push('createSubAccount');
    state.subAccounts.set(subAccountId, { tenantId: input.tenantId, name: input.name, closed: false });
    const token = `mocktoken${state.counter}`;
    const aad = subAccountSecretAad(input.tenantId, subAccountId);
    const authTokenEnc = this.mockDeps.sealSecret ? await this.mockDeps.sealSecret(token, aad) : `mock-sealed:${btoa(token)}`;
    return { subAccountId, authId: subAccountId, authTokenEnc };
  }

  override async closeSubAccount(subAccountId: string): Promise<void> {
    const sub = state.subAccounts.get(subAccountId);
    if (!sub) throw new VoipProviderError('mock', 20404, 'Sub-account not found', 'not_found');
    sub.closed = true;
    state.log.push(`closeSubAccount:${subAccountId}`);
  }

  override async setSubAccountStatus(subAccountId: string, status: 'active' | 'suspended'): Promise<void> {
    const sub = state.subAccounts.get(subAccountId);
    if (!sub) throw new VoipProviderError('mock', 20404, 'Sub-account not found', 'not_found');
    sub.suspended = status === 'suspended';
    state.log.push(`${status === 'suspended' ? 'suspend' : 'resume'}SubAccount:${subAccountId}`);
  }

  // ── Calls ─────────────────────────────────────────────────

  override async initiateCall(options: VoipCallOptions): Promise<VoipCallResult> {
    return this.recordCall({ mode: 'initiate', from: options.from, to: options.to, record: options.record });
  }

  override async placeCall(options: VoipPlaceCallOptions): Promise<VoipCallResult> {
    let agentLeg: string;
    if (options.mode === 'softphone') {
      if (!options.agentIdentity) throw new VoipProviderError('mock', 'AGENT_IDENTITY_REQUIRED', 'agentIdentity is required for a softphone call', 'invalid_request');
      agentLeg = `client:${voipClientIdentity(options.agentIdentity)}`;
    } else if (options.mode === 'bridge') {
      if (!options.agentNumber) throw new VoipProviderError('mock', 'AGENT_NUMBER_REQUIRED', 'agentNumber is required for a bridge call', 'invalid_request');
      agentLeg = options.agentNumber;
    } else {
      throw new VoipProviderError('mock', 'INVALID_MODE', 'mode must be softphone or bridge', 'invalid_request');
    }
    if (!/^\+[1-9]\d{9,14}$/.test(options.to)) throw new VoipProviderError('mock', 21211, 'Invalid phone number format', 'invalid_request');
    return this.recordCall({ mode: options.mode, from: options.from, to: options.to, agentLeg, record: options.record, callbackBaseUrl: options.callbackBaseUrl, announcementUrl: options.announcementUrl, maxDurationSeconds: options.maxDurationSeconds });
  }

  private recordCall(call: Omit<MockCallRecord, 'providerCallId' | 'status' | 'ended' | 'held'>): VoipCallResult {
    const providerCallId = nextId('CA');
    state.calls.push({ ...call, providerCallId, status: 'queued', ended: false, held: false });
    return { providerCallId, status: 'queued', direction: 'outbound', from: call.from, to: call.to };
  }

  private findCall(providerCallId: string): MockCallRecord {
    let call = state.calls.find((c) => c.providerCallId === providerCallId);
    // R135-4: the call simulator (services/voip/simulator.ts) plays calls with ids of its own, never placed through this
    // provider; the mock knows them too, so the call panel can hold, transfer and end a simulated call.
    if (!call && providerCallId.startsWith(SIMULATED_CALL_PREFIX)) {
      call = { providerCallId, mode: 'initiate', from: '', to: '', record: false, status: 'in-progress', ended: false, held: false };
      state.calls.push(call);
    }
    if (!call) throw new VoipProviderError('mock', 20404, 'Call not found', 'not_found');
    return call;
  }

  override async endCall(providerCallId: string): Promise<void> {
    const call = this.findCall(providerCallId);
    call.ended = true;
    call.status = 'completed';
  }

  override async holdCall(providerCallId: string, hold: boolean): Promise<void> {
    this.findCall(providerCallId).held = hold;
  }

  override async transferCall(providerCallId: string, targetNumber: string): Promise<void> {
    this.findCall(providerCallId).transferredTo = targetNumber;
  }

  override async getCallDetails(providerCallId: string): Promise<any> {
    const call = this.findCall(providerCallId);
    return { sid: call.providerCallId, status: call.status, from: call.from, to: call.to, direction: 'outbound-api' };
  }

  // ── Usage ─────────────────────────────────────────────────

  override async fetchUsage(input: VoipFetchUsageInput): Promise<VoipUsageRecord[]> {
    const sinceMs = Date.parse(input.since);
    if (Number.isNaN(sinceMs)) throw new VoipProviderError('mock', 'INVALID_SINCE', 'since must be an ISO 8601 time', 'invalid_request');
    return state.usage
      .filter((u) => u.subAccountId === input.subAccountId && Date.parse(u.startedAt) >= sinceMs)
      .map(({ subAccountId: _subAccountId, ...record }) => record);
  }

  // ── Numbers ───────────────────────────────────────────────

  override async searchAvailableNumbers(country: string, areaCode?: string): Promise<VoipAvailableNumber[]> {
    // Reserved area code that makes the search fail, so the provider-error path can be exercised end to end.
    if (areaCode === MOCK_FAILING_AREA_CODE) {
      throw new VoipProviderError('mock', 'SEARCH_UNAVAILABLE', 'Number search is unavailable right now', 'unavailable');
    }
    const prefix = COUNTRY_PREFIX[country.toUpperCase()];
    if (!prefix) return [];
    const out: VoipAvailableNumber[] = [];
    for (let i = 1; out.length < 5 && i < 50; i++) {
      const phoneNumber = `${prefix}${String(i * 111).padStart(4, '0')}`;
      if (state.numbers.has(phoneNumber)) continue;
      if (areaCode && !phoneNumber.includes(areaCode)) continue;
      out.push({ phoneNumber, friendlyName: phoneNumber, region: country.toUpperCase(), capabilities: { voice: true, sms: true }, monthlyPrice: 1 });
    }
    return out;
  }

  override async purchaseNumber(phoneNumber: string, friendlyName?: string, _webhookBaseUrl?: string, regulatory?: { bundleSid: string; addressSid: string }): Promise<VoipPurchasedNumber> {
    if (!/^\+[1-9]\d{9,14}$/.test(phoneNumber)) throw new VoipProviderError('mock', 21452, 'Invalid phone number', 'invalid_request');
    if (state.numbers.has(phoneNumber)) throw new VoipProviderError('mock', 21422, 'Phone number is not available', 'unavailable');
    if (regulatory) {
      // Like Twilio: the bundle must exist, belong to the address and be approved.
      const bundle = state.bundles.get(regulatory.bundleSid);
      if (!bundle || bundle.addressSid !== regulatory.addressSid) throw new VoipProviderError('mock', 21649, 'The bundle or address is not valid for this account', 'invalid_request');
      if (this.bundleStatus(bundle).status !== 'twilio-approved') throw new VoipProviderError('mock', 21649, 'The regulatory bundle is not approved', 'invalid_request');
      state.bundlePurchases.push({ phoneNumber, bundleSid: regulatory.bundleSid, addressSid: regulatory.addressSid });
    }
    const providerNumberId = nextId('PN');
    state.numbers.set(phoneNumber, { providerNumberId, phoneNumber });
    state.log.push(`purchaseNumber:${phoneNumber}`);
    return { providerNumberId, phoneNumber, friendlyName: friendlyName || phoneNumber, capabilities: { voice: true, sms: true } };
  }

  override async releaseNumber(providerNumberId: string): Promise<void> {
    for (const [number, rec] of state.numbers) {
      if (rec.providerNumberId === providerNumberId) {
        state.numbers.delete(number);
        state.log.push(`releaseNumber:${providerNumberId}`);
        return;
      }
    }
    throw new VoipProviderError('mock', 20404, 'Number not found', 'not_found');
  }

  // ── Regulatory bundles (R137) ─────────────────────────────

  override async submitRegulatoryBundle(input: VoipRegulatoryInput): Promise<VoipRegulatoryResult> {
    if (!input.address.street || !input.address.city || !input.address.postalCode) {
      throw new VoipProviderError('mock', 'ADDRESS_INCOMPLETE', 'The address is incomplete', 'invalid_request');
    }
    const bundleSid = nextId('BU');
    const addressSid = nextId('AD');
    const delayMs = Math.max(0, Number(this.mockDeps?.mockBundleDelaySeconds) || 0) * 1000;
    state.bundles.set(bundleSid, {
      bundleSid,
      addressSid,
      country: input.country.toUpperCase(),
      input,
      approveAt: Date.now() + delayMs,
      rejection: state.rejectBundlesWith,
      forced: null,
    });
    state.log.push(`submitRegulatoryBundle:${input.country.toUpperCase()}`);
    return { bundleSid, addressSid, status: 'pending-review' };
  }

  override async getRegulatoryBundleStatus(bundleSid: string): Promise<VoipRegulatoryStatus> {
    const bundle = state.bundles.get(bundleSid);
    if (!bundle) throw new VoipProviderError('mock', 'BUNDLE_NOT_FOUND', 'Bundle not found', 'not_found');
    return this.bundleStatus(bundle);
  }

  private bundleStatus(bundle: MockBundle): VoipRegulatoryStatus {
    if (bundle.forced) return { status: bundle.forced, failureReason: bundle.rejection };
    if (Date.now() < bundle.approveAt) return { status: 'pending-review', failureReason: null };
    return bundle.rejection ? { status: 'twilio-rejected', failureReason: bundle.rejection } : { status: 'twilio-approved', failureReason: null };
  }

  // ── Token, recordings, connection ─────────────────────────

  override async generateClientToken(userId: string, opts: { ttlSeconds?: number } = {}): Promise<VoipClientToken> {
    const identity = voipClientIdentity(userId);
    const expiresIn = Math.min(Math.max(Math.floor(opts.ttlSeconds ?? 900), 60), 3600);
    return { token: `mock.${btoa(JSON.stringify({ identity }))}.sig`, identity, expiresIn };
  }

  override async provisionSoftphoneKey(): Promise<{ apiKeyId: string; apiKeySecret: string }> {
    state.log.push('provisionSoftphoneKey');
    return { apiKeyId: `SKmock${++state.counter}`, apiKeySecret: 'mock-key-secret' };
  }

  override async fetchRecording(ref: VoipRecordingRef): Promise<VoipRecordingFile> {
    const rec = state.recordings.get(ref.recordingId);
    if (!rec) throw new VoipProviderError('mock', 404, 'Recording not found', 'not_found');
    const bytes = rec.bytes.buffer.slice(rec.bytes.byteOffset, rec.bytes.byteOffset + rec.bytes.byteLength) as ArrayBuffer;
    return { recordingId: ref.recordingId, contentType: 'audio/mpeg', bytes, durationSeconds: rec.durationSeconds };
  }

  override async deleteRecording(ref: VoipRecordingRef): Promise<void> {
    // Like Twilio, deleting a recording that is already gone is not an error.
    state.recordings.delete(ref.recordingId);
    state.deletedRecordings.push(ref.recordingId);
  }

  override async startRecording(providerCallId: string, _callbackBaseUrl: string): Promise<void> {
    this.findCall(providerCallId).recordingStarted = true;
  }

  /**
   * Like Twilio, refuses an account it does not know: a saved account id that is neither one of the mock's own
   * sub-accounts nor the mock's root account reports "not connected", so fake credentials never look connected.
   */
  override async testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }> {
    const accountId = this.mockSettings?.providerAccountId || this.mockSettings?.twilioAccountSid || '';
    const sub = accountId ? state.subAccounts.get(accountId) : undefined;
    if (accountId && accountId !== 'ACmock' && (!sub || sub.closed)) {
      return { connected: false, error: 'Authentication failed: the account is not known to the provider' };
    }
    return { connected: true, accountName: 'Mock provider' };
  }
}
