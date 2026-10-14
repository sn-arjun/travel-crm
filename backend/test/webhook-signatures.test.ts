import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { twilioSignature, verifySendgrid, verifyTwilio, timingSafeEqual } from '../src/middleware/provider-signature';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const AGENCY_NUMBER = '+918047182291';

// Production-like: test shortcuts off, so only genuinely signed callbacks pass.
const strict = { ...testEnv, TEST_MODE: 'false' };

const base = (e: any) => (e.API_PUBLIC_URL ? String(e.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost');

async function post(path: string, init: { form?: Record<string, string>; json?: string; headers?: Record<string, string> }, e: any = strict): Promise<Response> {
  const ctx = createExecutionContext();
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: string;
  if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  } else {
    headers['Content-Type'] = 'application/json';
    body = init.json ?? '';
  }
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method: 'POST', headers, body }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function signedForm(path: string, form: Record<string, string>, e: any = strict, token: string = e.TWILIO_AUTH_TOKEN) {
  return post(path, { form, headers: { 'X-Twilio-Signature': await twilioSignature(`${base(e)}/api/v1${path}`, form, token) } }, e);
}

async function one<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T> {
  return (await testEnv.MASTER_DB.prepare(sql).bind(...binds).first()) as T;
}

async function logCall(id: string, sid: string): Promise<void> {
  await testEnv.MASTER_DB
    .prepare(
      `INSERT INTO call_logs (id, direction, from_number, to_number, status, provider_call_id, created_by)
       VALUES (?, 'inbound', '+919000007001', ?, 'ringing', ?, ?)`,
    )
    .bind(id, AGENCY_NUMBER, sid, ADMIN_ID)
    .run();
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

/** r||s (what WebCrypto produces) -> the ASN.1 DER form SendGrid sends. */
function toDer(raw: Uint8Array): Uint8Array {
  const int = (part: Uint8Array) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i++;
    let v = part.slice(i);
    if (v[0] & 0x80) v = Uint8Array.of(0, ...v);
    return Uint8Array.of(0x02, v.length, ...v);
  };
  const body = Uint8Array.of(...int(raw.slice(0, 32)), ...int(raw.slice(32)));
  return Uint8Array.of(0x30, body.length, ...body);
}

describe('provider webhook signatures', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const reset = await worker.fetch(new Request('http://localhost/api/v1/test/reset', { method: 'POST' }), testEnv, createExecutionContext());
    expect(reset.status).toBe(200);
    await testEnv.MASTER_DB
      .prepare(`INSERT OR IGNORE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('r107-voice-1', ?, 'voice', ?, 'twilio')`)
      .bind(TENANT_ID, AGENCY_NUMBER)
      .run();
  });

  describe('Twilio voice callbacks', () => {
    it('a correctly signed callback is accepted and updates the call', async () => {
      await logCall('r107-call-ok', 'CA-r107-ok');
      const res = await signedForm('/voip/status-callback', { CallSid: 'CA-r107-ok', CallStatus: 'in-progress', To: AGENCY_NUMBER, From: '+919000007001' });
      expect(res.status).toBe(200);
      expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-ok')).status).toBe('in-progress');
    });

    it('no signature -> 403 and nothing written', async () => {
      await logCall('r107-call-unsigned', 'CA-r107-unsigned');
      const res = await post('/voip/status-callback', { form: { CallSid: 'CA-r107-unsigned', CallStatus: 'completed', To: AGENCY_NUMBER } });
      expect(res.status).toBe(403);
      expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-unsigned')).status).toBe('ringing');
    });

    it('a wrong signature, a signature made with another token, and tampered fields -> 403 and nothing written', async () => {
      await logCall('r107-call-bad', 'CA-r107-bad');
      const fields = { CallSid: 'CA-r107-bad', CallStatus: 'completed', To: AGENCY_NUMBER };

      const wrong = await post('/voip/status-callback', { form: fields, headers: { 'X-Twilio-Signature': 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=' } });
      expect(wrong.status).toBe(403);

      const otherToken = await signedForm('/voip/status-callback', fields, strict, 'an-attacker-token');
      expect(otherToken.status).toBe(403);

      // Signed for one status, sent with another.
      const signature = await twilioSignature(`${base(strict)}/api/v1/voip/status-callback`, { ...fields, CallStatus: 'ringing' }, strict.TWILIO_AUTH_TOKEN);
      const tampered = await post('/voip/status-callback', { form: fields, headers: { 'X-Twilio-Signature': signature } });
      expect(tampered.status).toBe(403);

      expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-bad')).status).toBe('ringing');
    });

    it('every voip route is guarded, TwiML ones included, and a Plivo-only signature is not accepted', async () => {
      for (const path of ['/voip/twiml/inbound', '/voip/twiml/outbound', '/voip/recording-callback', '/voip/voicemail-complete']) {
        expect((await post(path, { form: { To: AGENCY_NUMBER, From: '+919000007002' } })).status).toBe(403);
      }
      const plivo = await post('/voip/status-callback', { form: { CallUUID: 'x', CallStatus: 'completed' }, headers: { 'X-Plivo-Signature-V3': 'abc', 'X-Plivo-Signature-V3-Nonce': '1' } });
      expect(plivo.status).toBe(403);
    });

    it('a call log is never created for an unsigned inbound call', async () => {
      const before = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM call_logs')).n;
      const res = await post('/voip/twiml/inbound', { form: { CallSid: 'CA-r107-inbound-unsigned', To: AGENCY_NUMBER, From: '+919000007003' } });
      expect(res.status).toBe(403);
      expect((await one<{ n: number }>('SELECT COUNT(*) AS n FROM call_logs')).n).toBe(before);
    });

    it('a bad signature is rejected even in test mode; an unsigned callback is the only thing test mode lets through', async () => {
      await logCall('r107-call-testmode', 'CA-r107-testmode');
      const bad = await post('/voip/status-callback', { form: { CallSid: 'CA-r107-testmode', CallStatus: 'completed', To: AGENCY_NUMBER }, headers: { 'X-Twilio-Signature': 'bogus' } }, testEnv);
      expect(bad.status).toBe(403);
      expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-testmode')).status).toBe('ringing');

      const unsigned = await post('/voip/status-callback', { form: { CallSid: 'CA-r107-testmode', CallStatus: 'completed', To: AGENCY_NUMBER } }, testEnv);
      expect(unsigned.status).toBe(200);
      expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-testmode')).status).toBe('completed');
    });

    it('a workspace with its own Twilio token is verified with that token', async () => {
      await testEnv.MASTER_DB.prepare('DELETE FROM voip_settings').run();
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO voip_settings (id, voip_provider, provider_account_id, provider_auth_token) VALUES ('r107-vs', 'twilio', 'ACown', 'tenant-own-token')`)
        .run();
      try {
        await logCall('r107-call-own', 'CA-r107-own');
        const fields = { CallSid: 'CA-r107-own', CallStatus: 'completed', To: AGENCY_NUMBER };
        expect((await signedForm('/voip/status-callback', fields, strict, 'tenant-own-token')).status).toBe(200);
        expect((await one('SELECT status FROM call_logs WHERE id = ?', 'r107-call-own')).status).toBe('completed');
        expect((await signedForm('/voip/status-callback', { ...fields, CallStatus: 'busy' }, strict, 'someone-elses-token')).status).toBe(403);
      } finally {
        await testEnv.MASTER_DB.prepare('DELETE FROM voip_settings').run();
      }
    });

    it('a workspace on a provider other than Twilio has its callbacks refused (Plivo is dropped)', async () => {
      await testEnv.MASTER_DB.prepare('DELETE FROM voip_settings').run();
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO voip_settings (id, voip_provider, provider_account_id, provider_auth_token) VALUES ('r107-vs2', 'plivo', 'PLx', 'plivo-token')`)
        .run();
      try {
        const res = await signedForm('/voip/status-callback', { CallSid: 'CA-r107-plivo', CallStatus: 'completed', To: AGENCY_NUMBER });
        expect(res.status).toBe(403);
      } finally {
        await testEnv.MASTER_DB.prepare('DELETE FROM voip_settings').run();
      }
    });
  });

  describe('Twilio message status and inbound messages', () => {
    it('a signed delivery receipt updates the message; unsigned or wrongly signed does not', async () => {
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO message_log (id, channel, status, external_id) VALUES ('r107-msg-1', 'whatsapp', 'sent', 'SM-r107-1')`)
        .run();
      const fields = { MessageSid: 'SM-r107-1', MessageStatus: 'delivered' };

      expect((await post('/webhooks/twilio/status', { form: fields })).status).toBe(403);
      expect((await post('/webhooks/twilio/status', { form: fields, headers: { 'X-Twilio-Signature': 'nope' } })).status).toBe(403);
      expect((await one('SELECT status FROM message_log WHERE id = ?', 'r107-msg-1')).status).toBe('sent');

      expect((await signedForm('/webhooks/twilio/status', fields)).status).toBe(200);
      expect((await one('SELECT status FROM message_log WHERE id = ?', 'r107-msg-1')).status).toBe('delivered');
    });

    it('the inbound message webhook and the chatbot WhatsApp webhook reject unsigned requests', async () => {
      const form = { From: 'whatsapp:+919000007100', To: `whatsapp:${AGENCY_NUMBER}`, Body: 'hello', MessageSid: 'SM-r107-in' };
      expect((await post('/webhooks/inbound/twilio/message', { form })).status).toBe(403);
      expect((await post('/webhooks/chatbot/whatsapp', { form })).status).toBe(403);
      expect((await signedForm('/webhooks/inbound/twilio/message', form)).status).toBe(200);
    });
  });

  describe('SendGrid signed event webhook', () => {
    let publicKey = '';
    let keyPair: CryptoKeyPair;
    let sgEnv: any;

    async function sign(timestamp: string, body: string, der = true): Promise<string> {
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(timestamp + body)));
      return b64(der ? toDer(raw) : raw);
    }

    function events(messageId: string, event = 'delivered') {
      return JSON.stringify([{ event, message_id: messageId, email: 'r107@example.com' }]);
    }

    async function sendEvents(body: string, headers: Record<string, string>, e: any = sgEnv) {
      return post('/webhooks/sendgrid/events', { json: body, headers }, e);
    }

    beforeAll(async () => {
      keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
      publicKey = b64((await crypto.subtle.exportKey('spki', keyPair.publicKey)) as ArrayBuffer);
      sgEnv = { ...strict, SENDGRID_WEBHOOK_PUBLIC_KEY: publicKey };
      await testEnv.MASTER_DB.prepare(`INSERT OR IGNORE INTO contacts (id, name, type) VALUES ('r107-contact', 'Mail Receiver', 'customer')`).run();
    });

    async function logMail(id: string, messageId: string) {
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO email_message_log (id, contact_id, recipient_email, message_id, status) VALUES (?, 'r107-contact', 'r107@example.com', ?, 'sent')`)
        .bind(id, messageId)
        .run();
    }

    it('a valid ECDSA signature (DER, as SendGrid sends it) is accepted and the email log updated', async () => {
      await logMail('r107-mail-ok', 'sg-r107-ok');
      const body = events('sg-r107-ok');
      const ts = '1760000000';
      const res = await sendEvents(body, {
        'X-Twilio-Email-Event-Webhook-Signature': await sign(ts, body),
        'X-Twilio-Email-Event-Webhook-Timestamp': ts,
      });
      expect(res.status).toBe(200);
      expect((await one('SELECT status FROM email_message_log WHERE id = ?', 'r107-mail-ok')).status).toBe('delivered');
    });

    it('a body changed after signing, a wrong key, a missing signature and a missing timestamp are all 403 with nothing written', async () => {
      await logMail('r107-mail-bad', 'sg-r107-bad');
      const ts = '1760000001';
      const signedBody = events('sg-r107-bad', 'processed');
      const signature = await sign(ts, signedBody);
      const sigHeaders = { 'X-Twilio-Email-Event-Webhook-Signature': signature, 'X-Twilio-Email-Event-Webhook-Timestamp': ts };

      expect((await sendEvents(events('sg-r107-bad', 'bounce'), sigHeaders)).status).toBe(403);
      expect((await sendEvents(signedBody, { 'X-Twilio-Email-Event-Webhook-Signature': signature })).status).toBe(403);
      expect((await sendEvents(signedBody, {})).status).toBe(403);

      const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
      const otherKey = b64((await crypto.subtle.exportKey('spki', other.publicKey)) as ArrayBuffer);
      expect((await sendEvents(signedBody, sigHeaders, { ...strict, SENDGRID_WEBHOOK_PUBLIC_KEY: otherKey })).status).toBe(403);

      expect((await one('SELECT status FROM email_message_log WHERE id = ?', 'r107-mail-bad')).status).toBe('sent');
    });

    it('with no public key configured nothing is accepted outside test mode; test mode accepts an unsigned event', async () => {
      await logMail('r107-mail-nokey', 'sg-r107-nokey');
      const body = events('sg-r107-nokey');
      expect((await sendEvents(body, {}, strict)).status).toBe(403);
      expect((await one('SELECT status FROM email_message_log WHERE id = ?', 'r107-mail-nokey')).status).toBe('sent');

      expect((await sendEvents(body, {}, testEnv)).status).toBe(200);
      expect((await one('SELECT status FROM email_message_log WHERE id = ?', 'r107-mail-nokey')).status).toBe('delivered');
    });

    it('verifySendgrid also takes a raw r||s signature and rejects garbage without throwing', async () => {
      const ts = '1760000002';
      const body = '[]';
      expect(await verifySendgrid(publicKey, await sign(ts, body, false), ts, body)).toBe(true);
      expect(await verifySendgrid(publicKey, await sign(ts, body), ts, body)).toBe(true);
      expect(await verifySendgrid(publicKey, 'not base64 !!', ts, body)).toBe(false);
      expect(await verifySendgrid('garbage', await sign(ts, body), ts, body)).toBe(false);
      expect(await verifySendgrid(publicKey, await sign(ts, body), ts + '1', body)).toBe(false);
    });
  });

  describe('primitives', () => {
    it('verifyTwilio matches the documented algorithm (URL + sorted key/value pairs, HMAC-SHA1, base64)', async () => {
      // Example from Twilio's request-validation documentation.
      const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
      const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
      expect(await verifyTwilio(url, params, '12345', '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')).toBe(true);
      expect(await verifyTwilio(url, params, '12345', '0/KCTR6DLpKmkAf8muzZqo1nDgR=')).toBe(false);
      expect(await verifyTwilio(url, params, '', '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')).toBe(false);
      expect(await verifyTwilio(url, params, '12345', undefined)).toBe(false);
    });

    it('timingSafeEqual compares whole strings', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
      expect(timingSafeEqual('abc', 'abd')).toBe(false);
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
      expect(timingSafeEqual('', '')).toBe(true);
    });
  });
});
