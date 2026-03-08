/**
 * PlivoVoipProvider — Implements VoipProvider interface for Plivo.
 *
 * Plivo API Docs: https://www.plivo.com/docs/voice/api/
 * Plivo XML Docs: https://www.plivo.com/docs/voice/xml/
 *
 * Key differences from Twilio:
 * - <Say> → <Speak>, <Gather> → <GetDigits>, <Client> → <User>
 * - CallSid → CallUUID, CallStatus uses same names
 * - Auth: Basic auth with AUTH_ID:AUTH_TOKEN
 * - Webhook validation: X-Plivo-Signature-V3 with HMAC-SHA256
 */

import type {
  VoipProvider, VoipCallOptions, VoipCallResult, VoipAvailableNumber,
  VoipPurchasedNumber, VoipClientToken, IvrOption, VoipSettingsRow,
  VoipProviderCredentials,
} from './voip-provider';
import { VoipProviderError, escapeXml } from './voip-provider';

export class PlivoVoipProvider implements VoipProvider {
  readonly providerName = 'plivo' as const;

  private authId: string;
  private authToken: string;
  private baseUrl: string;

  constructor(
    private creds: VoipProviderCredentials,
    private settings: VoipSettingsRow,
  ) {
    this.authId = creds.accountId;
    this.authToken = creds.authToken;
    this.baseUrl = `https://api.plivo.com/v1/Account/${this.authId}`;
  }

  private get authHeader(): string {
    return 'Basic ' + btoa(`${this.authId}:${this.authToken}`);
  }

  // ── VoipProvider: Call Management ─────────────────────────

  async initiateCall(options: VoipCallOptions): Promise<VoipCallResult> {
    const body: Record<string, any> = {
      from: options.from,
      to: options.to,
      answer_url: options.statusCallbackUrl.replace('/status-callback', '/xml/outbound'),
      answer_method: 'POST',
      hangup_url: options.statusCallbackUrl,
      hangup_method: 'POST',
      ring_timeout: options.timeout || this.settings.maxRingDuration || 30,
    };

    if (options.record) {
      body.record = true;
      body.record_file_format = 'mp3';
      body.recording_callback_url = options.recordingCallbackUrl || options.statusCallbackUrl.replace('/status-callback', '/recording-callback');
      body.recording_callback_method = 'POST';
    }

    if (options.machineDetection) {
      body.machine_detection = true;
      body.machine_detection_url = options.statusCallbackUrl.replace('/status-callback', '/machine-detection');
    }

    const data = await this.plivoRequest<any>('POST', '/Call/', body);

    return {
      providerCallId: data.request_uuid,
      status: 'initiated',
      direction: 'outbound',
      from: options.from,
      to: options.to,
    };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.plivoRequest('DELETE', `/Call/${providerCallId}/`);
  }

  async holdCall(providerCallId: string, hold: boolean): Promise<void> {
    if (hold) {
      // Transfer to hold music URL
      await this.plivoRequest('POST', `/Call/${providerCallId}/`, {
        aleg_url: 'https://s3.amazonaws.com/plivocloud/music.xml',
        aleg_method: 'GET',
      });
    } else {
      // Resume — reconnect to original call flow
      await this.plivoRequest('POST', `/Call/${providerCallId}/`, {
        aleg_url: `${this.baseUrl}/xml/resume`,
        aleg_method: 'POST',
      });
    }
  }

  async transferCall(providerCallId: string, targetNumber: string): Promise<void> {
    await this.plivoRequest('POST', `/Call/${providerCallId}/`, {
      legs: 'aleg',
      aleg_url: `data:application/xml,${encodeURIComponent(this.generateTransferMarkup(targetNumber, this.settings.defaultCallerId || ''))}`,
      aleg_method: 'POST',
    });
  }

  async getCallDetails(providerCallId: string): Promise<any> {
    return this.plivoRequest('GET', `/Call/${providerCallId}/`);
  }

  // ── VoipProvider: Phone Number Management ─────────────────

  async searchAvailableNumbers(country: string, _areaCode?: string, contains?: string): Promise<VoipAvailableNumber[]> {
    const params = new URLSearchParams({
      country_iso: country,
      type: 'local',
      limit: '20',
    });
    if (contains) params.set('pattern', contains);

    const data = await this.plivoRequest<any>('GET', `/PhoneNumber/?${params}`);

    return (data.objects || []).map((n: any) => ({
      phoneNumber: n.number,
      friendlyName: n.number,
      region: n.region,
      capabilities: { voice: n.voice_enabled ?? true, sms: n.sms_enabled ?? true },
      monthlyPrice: n.monthly_rental_rate ? parseFloat(n.monthly_rental_rate) : undefined,
    }));
  }

  async purchaseNumber(phoneNumber: string, _friendlyName?: string, webhookBaseUrl?: string): Promise<VoipPurchasedNumber> {
    const body: Record<string, any> = { numbers: phoneNumber };
    if (webhookBaseUrl) {
      body.app_id = this.creds.appId || '';
    }

    const data = await this.plivoRequest<any>('POST', '/PhoneNumber/', body);

    return {
      providerNumberId: data.objects?.[0]?.number || phoneNumber,
      phoneNumber: phoneNumber,
      friendlyName: phoneNumber,
      capabilities: { voice: true, sms: true },
    };
  }

  async releaseNumber(providerNumberId: string): Promise<void> {
    await this.plivoRequest('DELETE', `/Number/${providerNumberId}/`);
  }

  // ── VoipProvider: Client Token ────────────────────────────

  async generateClientToken(userId: string): Promise<VoipClientToken> {
    // Plivo uses Endpoint credentials for browser SDK
    const expiresIn = 3600;
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: this.authId,
      sub: userId,
      exp: now + expiresIn,
      iat: now,
      jti: `${this.authId}-${now}`,
    };

    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.authToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return {
      token: `${signingInput}.${sigB64}`,
      identity: userId,
      expiresIn,
    };
  }

  // ── VoipProvider: Markup Generation (Plivo XML) ───────────

  generateDialMarkup(number: string, callerId: string, record = false): string {
    const recordAttr = record ? ' record="true" recordFileFormat="mp3"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}"${recordAttr} timeout="${this.settings.maxRingDuration || 30}">
    <Number>${escapeXml(number)}</Number>
  </Dial>
</Response>`;
  }

  generateClientDialMarkup(clientIdentity: string, callerId: string, record = false): string {
    const recordAttr = record ? ' record="true" recordFileFormat="mp3"' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}"${recordAttr}>
    <User>${escapeXml(clientIdentity)}</User>
  </Dial>
</Response>`;
  }

  generateIvrMarkup(greeting: string, options: IvrOption[], actionUrl: string): string {
    const optionsText = options
      .map((o) => `Press ${o.digit} for ${o.label}.`)
      .join(' ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits action="${escapeXml(actionUrl)}" method="POST" timeout="10" numDigits="1" retries="1">
    <Speak>${escapeXml(greeting)} ${escapeXml(optionsText)}</Speak>
  </GetDigits>
  <Speak>We didn't receive any input. Goodbye.</Speak>
</Response>`;
  }

  generateVoicemailMarkup(recordingCallbackUrl: string, greetingUrl?: string): string {
    const effectiveGreetingUrl = greetingUrl || this.settings.voicemailGreetingUrl;
    const greetingElement = effectiveGreetingUrl
      ? `<Play>${escapeXml(effectiveGreetingUrl)}</Play>`
      : '<Speak>Please leave a message after the beep.</Speak>';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}
  <Record maxLength="120" action="/api/v1/voip/voicemail-complete" recordingCallbackUrl="${escapeXml(recordingCallbackUrl)}" fileFormat="mp3" />
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
  ${message ? `<Speak>${escapeXml(message)}</Speak>` : ''}
  <Hangup/>
</Response>`;
  }

  generateEmptyResponse(): string {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  // ── VoipProvider: Webhook Validation ──────────────────────

  async validateWebhookSignature(
    url: string,
    _params: Record<string, string>,
    signature: string,
  ): Promise<boolean> {
    // Plivo V3 signature: HMAC-SHA256 of the URL with nonce
    // Signature header format: base64(hmac-sha256(url + nonce, auth_token))
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.authToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(url));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

    return expected === signature;
  }

  // ── VoipProvider: Connection Test ─────────────────────────

  async testConnection(): Promise<{ connected: boolean; accountName?: string; error?: string }> {
    try {
      const data = await this.plivoRequest<any>('GET', '/');
      return { connected: true, accountName: data.name || data.auth_id };
    } catch (e) {
      return { connected: false, error: (e as Error).message };
    }
  }

  // ── Private: Plivo HTTP Client ────────────────────────────

  private async plivoRequest<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
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
            'Content-Type': 'application/json',
          },
        };
        if (body && method !== 'GET' && method !== 'DELETE') {
          opts.body = JSON.stringify(body);
        }

        const res = await fetch(url, opts);

        if (res.status === 429 || res.status === 503) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (method === 'DELETE' && (res.status === 204 || res.status === 200)) {
          return {} as T;
        }

        if (res.status === 204) return {} as T;

        const data = await res.json() as any;

        if (!res.ok) {
          const message = data?.error || data?.message || `Plivo API error: ${res.status}`;
          throw new VoipProviderError('plivo', res.status, message);
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

    throw lastError || new VoipProviderError('plivo', 'RETRY_EXHAUSTED', 'Plivo request failed after retries');
  }
}
