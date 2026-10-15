/**
 * TwilioVoipProvider — Implements VoipProvider interface for Twilio.
 *
 * TICKET-366: Foundational service for all VoIP calling capabilities.
 * Refactored from TwilioVoiceService to support provider abstraction.
 */

import type {
  VoipProvider, VoipCallOptions, VoipCallResult, VoipAvailableNumber,
  VoipPurchasedNumber, VoipClientToken, IvrOption, VoipSettingsRow, VoipProviderName,
} from './voip-provider';
import type {
  VoipSubAccountInput, VoipSubAccount, VoipPlaceCallOptions, VoipFetchUsageInput, VoipUsageRecord,
  VoipRecordingRef, VoipRecordingFile, VoipProviderDeps,
} from './voip/contract';
import { subAccountSecretAad } from './voip/contract';
import { VoipProviderError, escapeXml, voipClientIdentity, errorKindForStatus } from './voip-base';

const TWILIO_API = 'https://api.twilio.com';

// ── Legacy types (re-exported for backward compat) ──────────

/** @deprecated Use VoipSettingsRow from voip-provider.ts */
export type VoipSettings = VoipSettingsRow;

/** @deprecated Use VoipCallOptions from voip-provider.ts */
export interface TwilioCallOptions {
  from: string;
  to: string;
  statusCallback: string;
  record: boolean;
  recordingStatusCallback?: string;
  machineDetection?: 'Enable' | 'DetectMessageEnd';
  timeout?: number;
}

/** @deprecated Use VoipCallResult from voip-provider.ts */
export interface TwilioCallResult {
  callSid: string;
  status: string;
  direction: string;
  from: string;
  to: string;
}

// Map Twilio error codes to user-friendly messages
const TWILIO_ERROR_MAP: Record<number, string> = {
  21211: 'Invalid phone number format',
  21214: 'Invalid phone number — the number is not a valid phone number',
  21215: 'Account not allowed to call this number',
  21217: 'Phone number does not match Twilio format',
  21401: 'Invalid Twilio credentials',
  21407: 'Phone number not verified — Twilio trial accounts can only call verified numbers',
  21602: 'Message body is required',
  21610: 'Attempt to send to unsubscribed recipient',
  32017: 'Twilio rate limit exceeded',
};

export class TwilioVoipProvider implements VoipProvider {
  readonly providerName: VoipProviderName = 'twilio';

  private accountSid: string;
  private authToken: string;
  private apiKeySid: string | undefined;
  private apiKeySecret: string | undefined;
  private twimlAppSid: string | undefined;
  private baseUrl: string;

  constructor(
    private env: { TWILIO_ACCOUNT_SID: string; TWILIO_AUTH_TOKEN: string },
    private settings: VoipSettingsRow,
    private deps: VoipProviderDeps = {},
  ) {
    // Prefer provider_* fields, fall back to twilio_* fields, then env
    this.accountSid = settings.providerAccountId || settings.twilioAccountSid || env.TWILIO_ACCOUNT_SID;
    this.authToken = settings.providerAuthToken || settings.twilioAuthToken || env.TWILIO_AUTH_TOKEN;
    this.apiKeySid = settings.providerApiKeyId || settings.twilioApiKeySid || undefined;
    this.apiKeySecret = settings.providerApiKeySecret || settings.twilioApiKeySecret || undefined;
    this.twimlAppSid = settings.providerAppId || settings.twilioTwimlAppSid || undefined;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  private get authHeader(): string {
    return 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`);
  }

  // ── VoipProvider: Call Management ─────────────────────────

  async initiateCall(options: VoipCallOptions): Promise<VoipCallResult> {
    const params = new URLSearchParams({
      From: options.from,
      To: options.to,
      Url: options.statusCallbackUrl.replace('/status-callback', '/twiml/outbound'),
      StatusCallback: options.statusCallbackUrl,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      Timeout: String(options.timeout || this.settings.maxRingDuration || 30),
    });

    if (options.record) {
      params.set('Record', 'true');
      params.set('RecordingChannels', 'dual');
      if (options.recordingCallbackUrl) {
        params.set('RecordingStatusCallback', options.recordingCallbackUrl);
        params.set('RecordingStatusCallbackMethod', 'POST');
      }
    }

    if (options.machineDetection) {
      params.set('MachineDetection', 'Enable');
    }

    return this.createCall(params);
  }

  /**
   * R301 contract: the agent leg first (their app or their phone), then the customer. The call is created
   * with inline TwiML so no other endpoint has to exist for the bridge to work; status and recording
   * callbacks go to the existing signed callback routes.
   */
  async placeCall(options: VoipPlaceCallOptions): Promise<VoipCallResult> {
    let agentLeg: string;
    if (options.mode === 'softphone') {
      if (!options.agentIdentity) throw new VoipProviderError('twilio', 'AGENT_IDENTITY_REQUIRED', 'agentIdentity is required for a softphone call', 'invalid_request');
      agentLeg = `client:${voipClientIdentity(options.agentIdentity)}`;
    } else if (options.mode === 'bridge') {
      if (!options.agentNumber) throw new VoipProviderError('twilio', 'AGENT_NUMBER_REQUIRED', 'agentNumber is required for a bridge call', 'invalid_request');
      agentLeg = options.agentNumber;
    } else {
      throw new VoipProviderError('twilio', 'INVALID_MODE', 'mode must be softphone or bridge', 'invalid_request');
    }

    const base = options.callbackBaseUrl.replace(/\/+$/, '');
    const ring = options.timeout || this.settings.maxRingDuration || 30;
    const recordAttrs = options.record
      ? ` record="record-from-answer-dual" recordingStatusCallback="${escapeXml(`${base}/api/v1/voip/recording-callback`)}"`
      : '';
    const twiml =
      `<Response><Dial callerId="${escapeXml(options.from)}" timeout="${ring}" answerOnBridge="true"${recordAttrs}>` +
      `<Number>${escapeXml(options.to)}</Number></Dial></Response>`;

    const params = new URLSearchParams({
      From: options.from,
      To: agentLeg,
      Twiml: twiml,
      StatusCallback: `${base}/api/v1/voip/status-callback`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      Timeout: String(ring),
    });
    if (options.machineDetection) params.set('MachineDetection', 'Enable');
    const result = await this.createCall(params);
    return { ...result, direction: 'outbound', from: options.from, to: options.to };
  }

  private async createCall(params: URLSearchParams): Promise<VoipCallResult> {
    const data = await this.twilioRequest<any>('POST', '/Calls.json', params);
    return {
      providerCallId: data.sid,
      status: data.status,
      direction: data.direction,
      from: data.from,
      to: data.to,
    };
  }

  // ── VoipProvider: Sub-accounts (platform credentials) ─────

  async createSubAccount(input: VoipSubAccountInput): Promise<VoipSubAccount> {
    if (!this.deps.sealSecret) {
      throw new VoipProviderError('twilio', 'NO_SEALER', 'No secret sealer configured; a sub-account token cannot be stored safely', 'provider');
    }
    const friendly = `${input.name.slice(0, 48)} (${input.tenantId.slice(-8)})`;
    const data = await this.twilioRequest<any>('POST', `${TWILIO_API}/2010-04-01/Accounts.json`, new URLSearchParams({ FriendlyName: friendly }));
    if (!data?.sid || !data?.auth_token) {
      throw new VoipProviderError('twilio', 'BAD_RESPONSE', 'Twilio did not return the new sub-account credentials', 'provider');
    }
    return {
      subAccountId: data.sid,
      authId: data.sid,
      authTokenEnc: await this.deps.sealSecret(data.auth_token, subAccountSecretAad(input.tenantId, data.sid)),
    };
  }

  async closeSubAccount(subAccountId: string): Promise<void> {
    await this.twilioRequest('POST', `${TWILIO_API}/2010-04-01/Accounts/${subAccountId}.json`, new URLSearchParams({ Status: 'closed' }));
  }

  // ── VoipProvider: Usage (platform credentials) ────────────

  async fetchUsage(input: VoipFetchUsageInput): Promise<VoipUsageRecord[]> {
    const sinceMs = Date.parse(input.since);
    if (Number.isNaN(sinceMs)) throw new VoipProviderError('twilio', 'INVALID_SINCE', 'since must be an ISO 8601 time', 'invalid_request');
    const query = new URLSearchParams({ 'StartTime>': new Date(sinceMs).toISOString().slice(0, 10), PageSize: '1000' });
    let url: string | null = `${TWILIO_API}/2010-04-01/Accounts/${input.subAccountId}/Calls.json?${query}`;
    const out: VoipUsageRecord[] = [];
    for (let page = 0; url && page < (input.maxPages ?? 20); page++) {
      const data: any = await this.twilioRequest<any>('GET', url);
      for (const call of data.calls || []) {
        const startedMs = Date.parse(call.start_time || call.date_created || '');
        if (Number.isNaN(startedMs) || startedMs < sinceMs) continue;
        const duration = Number.parseInt(call.duration ?? '0', 10) || 0;
        const price = Number.parseFloat(call.price ?? '0');
        out.push({
          providerCallId: call.sid,
          direction: String(call.direction || '').startsWith('inbound') ? 'inbound' : 'outbound',
          to: call.to,
          from: call.from,
          startedAt: new Date(startedMs).toISOString(),
          durationSeconds: duration,
          // Twilio bills voice per started minute.
          billedSeconds: duration > 0 ? Math.ceil(duration / 60) * 60 : 0,
          cost: Number.isFinite(price) ? Math.abs(price) : 0,
          currency: (call.price_unit || 'USD').toUpperCase(),
        });
      }
      url = data.next_page_uri ? `${TWILIO_API}${data.next_page_uri}` : null;
    }
    return out;
  }

  clientIdentity(userId: string): string {
    return voipClientIdentity(userId);
  }

  // ── VoipProvider: Recordings ──────────────────────────────

  async fetchRecording(ref: VoipRecordingRef): Promise<VoipRecordingFile> {
    const account = ref.subAccountId || this.accountSid;
    const res = await fetch(`${TWILIO_API}/2010-04-01/Accounts/${account}/Recordings/${ref.recordingId}.mp3`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new VoipProviderError('twilio', res.status, `Twilio recording fetch failed: ${res.status}`, errorKindForStatus(res.status));
    }
    return {
      recordingId: ref.recordingId,
      contentType: res.headers.get('Content-Type') || 'audio/mpeg',
      bytes: await res.arrayBuffer(),
    };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.twilioRequest('POST', `/Calls/${providerCallId}.json`, new URLSearchParams({
      Status: 'completed',
    }));
  }

  async holdCall(providerCallId: string, hold: boolean): Promise<void> {
    const twiml = hold
      ? '<Response><Play loop="0">http://com.twilio.music.classical.s3.amazonaws.com/BusssCalworable.mp3</Play></Response>'
      : '<Response><Dial><Client>agent</Client></Dial></Response>';

    await this.twilioRequest('POST', `/Calls/${providerCallId}.json`, new URLSearchParams({
      Twiml: twiml,
    }));
  }

  async transferCall(providerCallId: string, targetNumber: string): Promise<void> {
    const twiml = this.generateTransferMarkup(targetNumber, this.settings.defaultCallerId || '');
    await this.twilioRequest('POST', `/Calls/${providerCallId}.json`, new URLSearchParams({
      Twiml: twiml,
    }));
  }

  async getCallDetails(providerCallId: string): Promise<any> {
    return this.twilioRequest('GET', `/Calls/${providerCallId}.json`);
  }

  // ── VoipProvider: Phone Number Management ─────────────────

  async searchAvailableNumbers(country: string, areaCode?: string): Promise<VoipAvailableNumber[]> {
    const params = new URLSearchParams({ VoiceEnabled: 'true' });
    if (areaCode) params.set('AreaCode', areaCode);

    const data = await this.twilioRequest<any>(
      'GET',
      `/AvailablePhoneNumbers/${country}/Local.json?${params}`,
    );

    return (data.available_phone_numbers || []).map((n: any) => ({
      phoneNumber: n.phone_number,
      friendlyName: n.friendly_name,
      region: n.region,
      capabilities: n.capabilities || { voice: true, sms: true },
      monthlyPrice: undefined,
    }));
  }

  async purchaseNumber(phoneNumber: string, friendlyName?: string, webhookBaseUrl?: string): Promise<VoipPurchasedNumber> {
    const params = new URLSearchParams({ PhoneNumber: phoneNumber });
    if (friendlyName) params.set('FriendlyName', friendlyName);
    if (webhookBaseUrl) {
      params.set('VoiceUrl', `${webhookBaseUrl}/api/v1/voip/twiml/inbound`);
      params.set('VoiceMethod', 'POST');
      params.set('StatusCallback', `${webhookBaseUrl}/api/v1/voip/status-callback`);
      params.set('StatusCallbackMethod', 'POST');
    }

    const data = await this.twilioRequest<any>(
      'POST',
      '/IncomingPhoneNumbers.json',
      params,
    );

    return {
      providerNumberId: data.sid,
      phoneNumber: data.phone_number,
      friendlyName: data.friendly_name || phoneNumber,
      capabilities: { voice: data.capabilities?.voice ?? true, sms: data.capabilities?.sms ?? true },
    };
  }

  async releaseNumber(providerNumberId: string): Promise<void> {
    await this.twilioRequest('DELETE', `/IncomingPhoneNumbers/${providerNumberId}.json`);
  }

  // ── VoipProvider: Client Token ────────────────────────────

  async generateClientToken(userId: string): Promise<VoipClientToken> {
    if (!this.apiKeySid || !this.apiKeySecret) {
      throw new VoipProviderError('twilio', 'NO_API_KEY', 'Twilio API key not configured', 'auth');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    // Build Twilio Access Token JWT manually (no SDK)
    const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' };
    const payload = {
      jti: `${this.apiKeySid}-${now}`,
      iss: this.apiKeySid,
      sub: this.accountSid,
      exp: now + expiresIn,
      grants: {
        identity: voipClientIdentity(userId),
        voice: {
          outgoing: { application_sid: this.twimlAppSid || '' },
          incoming: { allow: true },
        },
      },
    };

    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.apiKeySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return {
      token: `${signingInput}.${sigB64}`,
      identity: voipClientIdentity(userId),
      expiresIn,
    };
  }

  // ── VoipProvider: Markup Generation (TwiML) ───────────────

  generateDialMarkup(number: string, callerId: string, record = false): string {
    const recordAttr = record ? ' record="record-from-answer-dual"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}"${recordAttr} timeout="${this.settings.maxRingDuration || 30}">
    <Number>${escapeXml(number)}</Number>
  </Dial>
</Response>`;
  }

  generateClientDialMarkup(clientIdentity: string, callerId: string, record = false): string {
    const recordAttr = record ? ' record="record-from-answer-dual"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}"${recordAttr}>
    <Client>${escapeXml(voipClientIdentity(clientIdentity))}</Client>
  </Dial>
</Response>`;
  }

  generateIvrMarkup(greeting: string, options: IvrOption[], actionUrl: string): string {
    const optionsText = options
      .map((o) => `Press ${o.digit} for ${o.label}.`)
      .join(' ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="10" action="${escapeXml(actionUrl)}">
    <Say>${escapeXml(greeting)} ${escapeXml(optionsText)}</Say>
  </Gather>
  <Say>We didn't receive any input. Goodbye.</Say>
</Response>`;
  }

  generateVoicemailMarkup(recordingCallbackUrl: string, greetingUrl?: string): string {
    const effectiveGreetingUrl = greetingUrl || this.settings.voicemailGreetingUrl;
    const greetingElement = effectiveGreetingUrl
      ? `<Play>${escapeXml(effectiveGreetingUrl)}</Play>`
      : '<Say>Please leave a message after the beep.</Say>';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}
  <Record maxLength="120" action="/api/v1/voip/voicemail-complete" recordingStatusCallback="${escapeXml(recordingCallbackUrl)}" />
</Response>`;
  }

  generateTransferMarkup(targetNumber: string, callerId: string): string {
    const cid = callerId || this.settings.defaultCallerId || '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(cid)}">
    <Number>${escapeXml(targetNumber)}</Number>
  </Dial>
</Response>`;
  }

  generateHangupMarkup(message?: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${message ? `<Say>${escapeXml(message)}</Say>` : ''}
  <Hangup/>
</Response>`;
  }

  generateEmptyResponse(): string {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  // ── VoipProvider: Webhook Validation ──────────────────────

  async validateWebhookSignature(
    url: string,
    params: Record<string, string>,
    signature: string,
  ): Promise<boolean> {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.authToken),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

    return expected === signature;
  }

  // ── VoipProvider: Connection Test ─────────────────────────

  async testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }> {
    try {
      const data = await this.twilioRequest<any>('GET', '.json');
      return { connected: true, accountName: data.friendly_name || data.sid };
    } catch (e) {
      return { connected: false, error: (e as Error).message };
    }
  }

  // ── Private: Twilio HTTP Client ───────────────────────────

  private async twilioRequest<T>(
    method: string,
    path: string,
    body?: URLSearchParams,
    retries = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
        const opts: RequestInit = {
          method,
          headers: {
            Authorization: this.authHeader,
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
        };
        if (body && method !== 'GET') opts.body = body.toString();

        const res = await fetch(url, opts);

        if (res.status === 429 || res.status === 503) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (method === 'DELETE' && res.status === 204) {
          return {} as T;
        }

        const data = await res.json() as any;

        if (!res.ok) {
          const code = data?.code || data?.error_code || 0;
          const message = TWILIO_ERROR_MAP[code] || data?.message || `Twilio API error: ${res.status}`;
          throw new VoipProviderError('twilio', code, message, code === 21401 ? 'auth' : errorKindForStatus(res.status));
        }

        return data as T;
      } catch (e) {
        if (e instanceof VoipProviderError) throw e;
        lastError = e as Error;
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new VoipProviderError('twilio', 'RETRY_EXHAUSTED', 'Twilio request failed after retries');
  }
}

/** @deprecated Use VoipProviderError from voip-provider.ts */
export class TwilioError extends VoipProviderError {
  constructor(code: number, message: string) {
    super('twilio', code, message);
    this.name = 'TwilioError';
  }
}
