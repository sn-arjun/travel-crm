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
  type VoipRecordingRef, type VoipSubAccount, type VoipSubAccountInput, type VoipUsageRecord,
} from './contract';

/** The token the mock provider signs webhooks with when neither the workspace row nor the environment names one. */
export const MOCK_AUTH_TOKEN = 'mock-auth-token';

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
}

interface MockState {
  counter: number;
  calls: MockCallRecord[];
  subAccounts: Map<string, { tenantId: string; name: string; closed: boolean }>;
  numbers: Map<string, { providerNumberId: string; phoneNumber: string }>;
  usage: Array<VoipUsageRecord & { subAccountId: string }>;
  recordings: Map<string, { bytes: Uint8Array; durationSeconds: number }>;
}

function fresh(): MockState {
  return { counter: 0, calls: [], subAccounts: new Map(), numbers: new Map(), usage: [], recordings: new Map() };
}

let state: MockState = fresh();

/** 34-character Twilio-style id: two letters then a 32-digit hex counter. */
function nextId(prefix: string): string {
  state.counter += 1;
  return prefix + state.counter.toString(16).padStart(32, '0');
}

const COUNTRY_PREFIX: Record<string, string> = { GB: '+4420300', US: '+1415555', AU: '+6129000', SG: '+65310', DE: '+4930300', MY: '+60312' };

export class MockVoipProvider extends TwilioVoipProvider {
  override readonly providerName = 'mock' as const;

  constructor(settings: VoipSettingsRow, private mockDeps: VoipProviderDeps = {}) {
    super({ TWILIO_ACCOUNT_SID: 'ACmock', TWILIO_AUTH_TOKEN: MOCK_AUTH_TOKEN }, settings, mockDeps);
  }

  // ── Test helpers (static: state is per isolate, not per instance) ──

  static reset(): void {
    state = fresh();
  }

  static get calls(): readonly MockCallRecord[] {
    return state.calls;
  }

  static get subAccounts(): ReadonlyMap<string, { tenantId: string; name: string; closed: boolean }> {
    return state.subAccounts;
  }

  /** Mark a placed call finished and make it show up in fetchUsage, as Twilio would after the call. */
  static completeCall(
    providerCallId: string,
    durationSeconds: number,
    opts: { subAccountId?: string; direction?: 'inbound' | 'outbound'; startedAt?: string; cost?: number } = {},
  ): VoipUsageRecord {
    const call = state.calls.find((c) => c.providerCallId === providerCallId);
    if (!call) throw new VoipProviderError('mock', 'CALL_NOT_FOUND', `No mock call ${providerCallId}`, 'not_found');
    call.status = 'completed';
    call.ended = true;
    const billedSeconds = durationSeconds > 0 ? Math.ceil(durationSeconds / 60) * 60 : 0;
    const record: VoipUsageRecord = {
      providerCallId,
      direction: opts.direction ?? 'outbound',
      to: call.to,
      from: call.from,
      startedAt: opts.startedAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, state.counter)).toISOString(),
      durationSeconds,
      billedSeconds,
      cost: opts.cost ?? Math.round((billedSeconds / 60) * 0.014 * 10000) / 10000,
      currency: 'USD',
    };
    state.usage.push({ ...record, subAccountId: opts.subAccountId ?? '' });
    return record;
  }

  /** Put audio behind a recording id so fetchRecording can return it. */
  static addRecording(recordingId: string, bytes: Uint8Array, durationSeconds = 0): void {
    state.recordings.set(recordingId, { bytes, durationSeconds });
  }

  // ── Sub-accounts ──────────────────────────────────────────

  override async createSubAccount(input: VoipSubAccountInput): Promise<VoipSubAccount> {
    const subAccountId = nextId('AC');
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
    return this.recordCall({ mode: options.mode, from: options.from, to: options.to, agentLeg, record: options.record, callbackBaseUrl: options.callbackBaseUrl });
  }

  private recordCall(call: Omit<MockCallRecord, 'providerCallId' | 'status' | 'ended' | 'held'>): VoipCallResult {
    const providerCallId = nextId('CA');
    state.calls.push({ ...call, providerCallId, status: 'queued', ended: false, held: false });
    return { providerCallId, status: 'queued', direction: 'outbound', from: call.from, to: call.to };
  }

  private findCall(providerCallId: string): MockCallRecord {
    const call = state.calls.find((c) => c.providerCallId === providerCallId);
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

  override async purchaseNumber(phoneNumber: string, friendlyName?: string): Promise<VoipPurchasedNumber> {
    if (!/^\+[1-9]\d{9,14}$/.test(phoneNumber)) throw new VoipProviderError('mock', 21452, 'Invalid phone number', 'invalid_request');
    if (state.numbers.has(phoneNumber)) throw new VoipProviderError('mock', 21422, 'Phone number is not available', 'unavailable');
    const providerNumberId = nextId('PN');
    state.numbers.set(phoneNumber, { providerNumberId, phoneNumber });
    return { providerNumberId, phoneNumber, friendlyName: friendlyName || phoneNumber, capabilities: { voice: true, sms: true } };
  }

  override async releaseNumber(providerNumberId: string): Promise<void> {
    for (const [number, rec] of state.numbers) {
      if (rec.providerNumberId === providerNumberId) {
        state.numbers.delete(number);
        return;
      }
    }
    throw new VoipProviderError('mock', 20404, 'Number not found', 'not_found');
  }

  // ── Token, recordings, connection ─────────────────────────

  override async generateClientToken(userId: string): Promise<VoipClientToken> {
    const identity = voipClientIdentity(userId);
    return { token: `mock.${btoa(JSON.stringify({ identity }))}.sig`, identity, expiresIn: 3600 };
  }

  override async fetchRecording(ref: VoipRecordingRef): Promise<VoipRecordingFile> {
    const rec = state.recordings.get(ref.recordingId);
    if (!rec) throw new VoipProviderError('mock', 404, 'Recording not found', 'not_found');
    const bytes = rec.bytes.buffer.slice(rec.bytes.byteOffset, rec.bytes.byteOffset + rec.bytes.byteLength) as ArrayBuffer;
    return { recordingId: ref.recordingId, contentType: 'audio/mpeg', bytes, durationSeconds: rec.durationSeconds };
  }

  override async testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }> {
    return { connected: true, accountName: 'Mock provider' };
  }
}
