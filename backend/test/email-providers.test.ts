import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { providerFor, sendMail, type MailKind } from '../src/services/mail/provider';
import { mockSent } from '../src/services/mail/providers/mock';
import { sendTransactional } from '../src/services/mail/transactional';
import { sendEmail } from '../src/services/email';
import { resolveReplyTo } from '../src/services/mail/delivery';
import { replyAddressFor, tokenFromAddress } from '../src/services/mail/reply-token';
import { parseMime, stripQuotedHistory } from '../src/services/mail/mime';
import { handleInboundEmail, MAX_INBOUND_BYTES, type InboundEmailMessage } from '../src/services/inbound/email-routing';

const testEnv = env as any;

// ---------------------------------------------------------------------------------------------
// Sending: routing by mail kind, fallback, marketing never on Cloudflare
// ---------------------------------------------------------------------------------------------

interface FakeBinding {
  send: ReturnType<typeof vi.fn>;
}

function binding(impl?: (msg: any) => Promise<any>): FakeBinding {
  return { send: vi.fn(impl ?? (async () => ({ messageId: 'cf-msg-1' }))) };
}

function liveEnv(extra: Record<string, unknown> = {}): any {
  return { ...testEnv, TEST_MODE: 'false', SENDGRID_API_KEY: 'SG.test', EMAIL_FROM: 'noreply@platform.example', EMAIL_FROM_NAME: 'Platform', ...extra };
}

const KINDS: MailKind[] = ['platform_system', 'agency_transactional', 'agency_marketing'];

function mockSendgridFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202, headers: { 'x-message-id': 'sg-msg-1' } }));
}

describe('email providers: routing by mail kind', () => {
  afterEach(() => vi.restoreAllMocks());

  it('with the default setting every kind uses SendGrid, even when the binding exists', () => {
    const e = liveEnv({ EMAIL: binding() });
    for (const kind of KINDS) expect(providerFor(e, kind).name).toBe('sendgrid');
  });

  it('EMAIL_SYSTEM_PROVIDER=cloudflare moves only platform system mail, and only with the binding', () => {
    const withBinding = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: binding() });
    expect(providerFor(withBinding, 'platform_system').name).toBe('cloudflare');
    expect(providerFor(withBinding, 'agency_transactional').name).toBe('sendgrid');
    expect(providerFor(withBinding, 'agency_marketing').name).toBe('sendgrid');
    const noBinding = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare' });
    expect(providerFor(noBinding, 'platform_system').name).toBe('sendgrid');
  });

  it('marketing can never route to Cloudflare, whatever the settings', async () => {
    const b = binding();
    const spy = mockSendgridFetch();
    for (const setting of ['cloudflare', 'CLOUDFLARE', ' cloudflare ', 'mock', 'sendgrid', undefined]) {
      const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: setting, EMAIL: b });
      expect(providerFor(e, 'agency_marketing').name).toBe('sendgrid');
      const res = await sendMail(e, 'agency_marketing', { to: 'c@example.com', subject: 'Offer', html: '<p>x</p>', unsubscribeUrl: 'https://x/u' });
      expect(res.provider).toBe('sendgrid');
    }
    expect(b.send).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(6);
  });

  it('platform system mail goes through the Cloudflare binding and records the provider and message id', async () => {
    const b = binding();
    const spy = mockSendgridFetch();
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: b });
    const result = await sendTransactional(e, { to: 'person@example.com', template: 'password_changed' });
    expect(result).toMatchObject({ delivered: true, via: 'cloudflare' });
    expect(result.fallbackFrom).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalledTimes(1);
    const sent = b.send.mock.calls[0][0];
    expect(sent.to).toBe('person@example.com');
    expect(sent.from).toEqual({ email: 'noreply@platform.example', name: 'Platform' });
    expect(sent.subject).toBeTruthy();
    expect(sent.html).toContain('<');
    expect(sent.text).toBeTruthy();
  });

  it('a Cloudflare failure is retried once on SendGrid, and the result says so', async () => {
    const b = binding(async () => {
      throw Object.assign(new Error('daily limit'), { code: 'E_DAILY_LIMIT_EXCEEDED' });
    });
    const spy = mockSendgridFetch();
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: b });
    const res = await sendMail(e, 'platform_system', { to: 'person@example.com', subject: 'Reset', html: '<p>x</p>' });
    expect(res).toMatchObject({ success: true, provider: 'sendgrid', fallbackFrom: 'cloudflare', messageId: 'sg-msg-1' });
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);

    const viaTransactional = await sendTransactional(e, { to: 'p@example.com', template: 'reset_password', data: { resetUrl: 'http://x/r' } });
    expect(viaTransactional).toMatchObject({ delivered: true, via: 'sendgrid', fallbackFrom: 'cloudflare' });
  });

  it('when both providers fail the error names both, and nothing throws', async () => {
    const b = binding(async () => {
      throw Object.assign(new Error('nope'), { code: 'E_INTERNAL_SERVER_ERROR' });
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 500 }));
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: b });
    const res = await sendMail(e, 'platform_system', { to: 'p@example.com', subject: 'S', html: '<p>x</p>' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('E_INTERNAL_SERVER_ERROR');
    expect(res.error).toContain('500');
  });

  it('a SendGrid failure for agency mail is not retried anywhere else', async () => {
    const b = binding();
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 500 }));
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: b });
    const res = await sendEmail(e, { to: 'c@example.com', subject: 'Hi', html: '<p>x</p>' });
    expect(res.success).toBe(false);
    expect(b.send).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('with the default flag the behaviour is unchanged: SendGrid, from the configured sender', async () => {
    const b = binding();
    const spy = mockSendgridFetch();
    const result = await sendTransactional(liveEnv({ EMAIL: b }), { to: 'p@example.com', template: 'password_changed' });
    expect(result).toMatchObject({ delivered: true, via: 'sendgrid' });
    expect(b.send).not.toHaveBeenCalled();
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toEqual({ email: 'noreply@platform.example', name: 'Platform' });
  });

  it('the mock provider records mail and sends nothing; transactional writes it to the outbox', async () => {
    const spy = mockSendgridFetch();
    const before = mockSent.length;
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'mock' });
    const res = await sendMail(e, 'platform_system', { to: 'p@example.com', subject: 'S', html: '<p>x</p>' });
    expect(res).toMatchObject({ success: true, provider: 'mock' });
    expect(mockSent.length).toBe(before + 1);
    const t = await sendTransactional(e, { to: 'p@example.com', template: 'password_changed' });
    expect(t.via).toBe('outbox');
    expect(spy).not.toHaveBeenCalled();
  });

  it('the Cloudflare provider reports a missing binding as an error', async () => {
    const { cloudflareProvider } = await import('../src/services/mail/providers/cloudflare');
    const res = await cloudflareProvider.send(liveEnv({ EMAIL: undefined }), { to: 'a@b.test', subject: 's', html: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('EMAIL');
  });
});

// ---------------------------------------------------------------------------------------------
// MIME reading
// ---------------------------------------------------------------------------------------------

const CRLF = '\r\n';
function mime(lines: string[]): string {
  return lines.join(CRLF);
}

describe('inbound MIME reading', () => {
  it('reads a multipart/alternative message with quoted-printable text, an HTML part and an encoded subject', () => {
    const raw = mime([
      'From: Priya Nair <priya@example.com>',
      'Subject: =?UTF-8?B?UmU6IEtlcmFsYSB0cmlwIOKAkyBjb25maXJt?=',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Yes, confirmed =E2=80=93 thanks!',
      '',
      'On Mon, 5 Oct 2026, Agency <a@x.test> wrote:',
      '> please confirm',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Yes, confirmed</p>',
      '--b1--',
      '',
    ]);
    const parsed = parseMime(new TextEncoder().encode(raw));
    expect(parsed.subject).toBe('Re: Kerala trip – confirm');
    expect(parsed.text).toContain('Yes, confirmed – thanks!');
    expect(parsed.html).toBe('<p>Yes, confirmed</p>');
    expect(stripQuotedHistory(parsed.text)).toBe('Yes, confirmed – thanks!');
  });

  it('decodes base64 bodies and counts attachments without keeping them', () => {
    const raw = mime([
      'Content-Type: multipart/mixed; boundary=xx',
      '',
      '--xx',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa('Hello from base64'),
      '--xx',
      'Content-Type: application/pdf; name="a.pdf"',
      'Content-Disposition: attachment; filename="a.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQ=',
      '--xx--',
    ]);
    const parsed = parseMime(new TextEncoder().encode(raw));
    expect(parsed.text).toBe('Hello from base64');
    expect(parsed.attachmentCount).toBe(1);
  });

  it('strips common quoted-history markers and keeps the whole text when nothing but quotes remain', () => {
    expect(stripQuotedHistory('Thanks!\n\n-----Original Message-----\nFrom: a\nold')).toBe('Thanks!');
    expect(stripQuotedHistory('Thanks!\nFrom: Agency\nSent: Monday\nold')).toBe('Thanks!');
    expect(stripQuotedHistory('> only quoted')).toBe('> only quoted');
  });
});

// ---------------------------------------------------------------------------------------------
// Reply addresses and inbound routing
// ---------------------------------------------------------------------------------------------

const TENANT: Record<'A' | 'B', string> = { A: '0198e131-0000-7000-8000-0000000000a1', B: '0198e131-0000-7000-8000-0000000000b1' };
const POOL: Record<'A' | 'B', string> = { A: 'TENANT_DB_POOL_1', B: 'TENANT_DB_POOL_2' };
const CONTACT: Record<'A' | 'B', string> = { A: '0198e131-3333-7000-8000-0000000000a1', B: '0198e131-3333-7000-8000-0000000000b1' };
const DOMAIN = 'in.example.test';

const multiEnv: any = { ...testEnv, TENANCY_MODE: 'multi', EMAIL_INBOUND_DOMAIN: DOMAIN };

function db(k: 'A' | 'B'): D1Database {
  return testEnv[POOL[k]];
}

async function count(k: 'A' | 'B', sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db(k).prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

type Fake = InboundEmailMessage & { rejected: string | null };

function fakeMessage(to: string, lines: string[], from = 'priya@example.com'): Fake {
  const raw = mime(lines);
  const bytes = new TextEncoder().encode(raw);
  const headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    if (line === '') break;
    const i = line.indexOf(':');
    if (i > 0) headers.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const msg = {
    from,
    to,
    headers,
    raw: new Response(bytes).body as ReadableStream<Uint8Array>,
    rawSize: bytes.length,
    rejected: null as string | null,
    setReject(reason: string) {
      msg.rejected = reason;
    },
  };
  return msg;
}

function replyLines(opts: { messageId: string; from?: string; text?: string; extra?: string[] }): string[] {
  return [
    `From: ${opts.from ?? 'Priya Nair <priya@example.com>'}`,
    'Subject: Re: Your Kerala itinerary',
    `Message-ID: <${opts.messageId}>`,
    'Authentication-Results: mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',
    ...(opts.extra ?? []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.text ?? 'Looks great, please book it.\r\n\r\nOn Mon, 5 Oct 2026, Agency <hello@agency.test> wrote:\r\n> Here is the plan',
  ];
}

describe('inbound email (Cloudflare Email Routing)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    for (const k of ['A', 'B'] as const) {
      await applyD1Migrations(db(k), testEnv.TEST_MIGRATIONS);
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, ?, ?, 'pro', 'active', ?)`)
        .bind(TENANT[k], `R131 ${k}`, `r131-${k.toLowerCase()}`, POOL[k])
        .run();
      await db(k).prepare(`INSERT OR REPLACE INTO contacts (id, name, email, type) VALUES (?, ?, 'priya@example.com', 'customer')`).bind(CONTACT[k], `Priya ${k}`).run();
    }
  });

  it('the reply address is reply+<token>@<inbound domain>, stable per thread, different per contact and agency', async () => {
    const a1 = await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A });
    const a2 = await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A });
    const b1 = await replyAddressFor(multiEnv, { tenantId: TENANT.B, contactId: CONTACT.B });
    expect(a1).toMatch(/^reply\+[a-z2-7]{24}@in\.example\.test$/);
    expect(a2).toBe(a1);
    expect(b1).not.toBe(a1);
    expect(tokenFromAddress(multiEnv, a1!)).toBe(a1!.slice(6, 30));
    expect(tokenFromAddress(multiEnv, 'reply+abc@in.example.test')).toBeNull();
    expect(tokenFromAddress(multiEnv, a1!.replace(DOMAIN, 'evil.test'))).toBeNull();
    expect(await replyAddressFor({ ...multiEnv, EMAIL_INBOUND_DOMAIN: undefined }, { tenantId: TENANT.A, contactId: CONTACT.A })).toBeNull();
  });

  it('resolveReplyTo keeps today\'s behaviour without an inbound domain and uses the token address with one', async () => {
    const plain = { ...multiEnv, EMAIL_INBOUND_DOMAIN: undefined };
    const user = await db('A').prepare('SELECT 1').first(); // db reachable
    expect(user).toBeTruthy();
    await db('A').prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES ('r131-user', 'sender@agency.test', 'x', 'admin', 'Sender', 1)`).run();
    expect(await resolveReplyTo(plain, db('A'), TENANT.A, 'r131-user', { contactId: CONTACT.A })).toBe('sender@agency.test');
    expect(await resolveReplyTo(plain, db('A'), TENANT.A, 'r131-user')).toBe('sender@agency.test');
    const tokenised = await resolveReplyTo(multiEnv, db('A'), TENANT.A, 'r131-user', { contactId: CONTACT.A });
    expect(tokenised).toMatch(/^reply\+[a-z2-7]{24}@in\.example\.test$/);
    // no contact thread: the sender's own address, as before
    expect(await resolveReplyTo(multiEnv, db('A'), TENANT.A, 'r131-user')).toBe('sender@agency.test');
  });

  it('a reply lands in the right agency\'s inbox, matched to its contact, with the quoted history removed', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A }))!;
    const msg = fakeMessage(to, replyLines({ messageId: 'r131-a-1@example.com' }));
    const outcome = await handleInboundEmail(msg, multiEnv);
    expect(outcome.status).toBe('stored');
    expect(outcome.tenantId).toBe(TENANT.A);
    expect(msg.rejected).toBeNull();

    const row = await db('A')
      .prepare(`SELECT channel, direction, subject, content, contact_id, from_address, to_address, metadata FROM message_log WHERE external_id = 'r131-a-1@example.com' OR external_id = '<r131-a-1@example.com>'`)
      .first<any>();
    expect(row).toMatchObject({ channel: 'email', direction: 'incoming', subject: 'Re: Your Kerala itinerary', contact_id: CONTACT.A, from_address: 'priya@example.com' });
    expect(row.content).toBe('Looks great, please book it.');
    expect(row.to_address).toBe(to);
    expect(JSON.parse(row.metadata)).toMatchObject({ provider: 'cloudflare-email-routing', auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' } });

    // nothing reached agency B
    expect(await count('B', `SELECT COUNT(*) AS n FROM message_log WHERE subject = 'Re: Your Kerala itinerary'`)).toBe(0);
  });

  it('a reply to agency B\'s token lands only in agency B, even from the same customer address', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.B, contactId: CONTACT.B }))!;
    const before = await count('A', 'SELECT COUNT(*) AS n FROM message_log');
    const outcome = await handleInboundEmail(fakeMessage(to, replyLines({ messageId: 'r131-b-1@example.com', text: 'Hello B' })), multiEnv);
    expect(outcome).toMatchObject({ status: 'stored', tenantId: TENANT.B });
    expect(await count('B', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'Hello B' AND contact_id = ?`, CONTACT.B)).toBe(1);
    expect(await count('A', 'SELECT COUNT(*) AS n FROM message_log')).toBe(before);
    expect(await count('A', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'Hello B'`)).toBe(0);
  });

  it('a redelivery of the same Message-ID is not stored twice', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A }))!;
    const first = await handleInboundEmail(fakeMessage(to, replyLines({ messageId: 'r131-dup@example.com', text: 'once' })), multiEnv);
    const second = await handleInboundEmail(fakeMessage(to, replyLines({ messageId: 'r131-dup@example.com', text: 'once' })), multiEnv);
    expect(first.status).toBe('stored');
    expect(second.status).toBe('duplicate');
    expect(await count('A', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'once'`)).toBe(1);
  });

  it('an unknown token is rejected, logged, and stores nothing anywhere', async () => {
    const before = [await count('A', 'SELECT COUNT(*) AS n FROM message_log'), await count('B', 'SELECT COUNT(*) AS n FROM message_log')];
    const msg = fakeMessage(`reply+${'a'.repeat(24)}@${DOMAIN}`, replyLines({ messageId: 'r131-unknown@example.com', text: 'who am I' }));
    const outcome = await handleInboundEmail(msg, multiEnv);
    expect(outcome.status).toBe('rejected');
    expect(msg.rejected).toBe('Unknown address');
    expect([await count('A', 'SELECT COUNT(*) AS n FROM message_log'), await count('B', 'SELECT COUNT(*) AS n FROM message_log')]).toEqual(before);
    const log = await testEnv.MASTER_DB
      .prepare(`SELECT status, error_message FROM webhook_log WHERE source = 'cloudflare:email' AND status = 'rejected' ORDER BY rowid DESC LIMIT 1`)
      .first();
    expect(log).toMatchObject({ status: 'rejected' });
    expect(log.error_message).toContain('token');
  });

  it('an expired token (removed from the store) is rejected', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A }))!;
    await testEnv.CACHE.delete(`replytok:t:${tokenFromAddress(multiEnv, to)}`);
    const msg = fakeMessage(to, replyLines({ messageId: 'r131-expired@example.com', text: 'late' }));
    expect((await handleInboundEmail(msg, multiEnv)).status).toBe('rejected');
    expect(msg.rejected).toBe('Unknown address');
    expect(await count('A', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'late'`)).toBe(0);
  });

  it('an address that is neither a token nor a registered agency address is dropped; a registered one is accepted', async () => {
    const stranger = fakeMessage(`random@${DOMAIN}`, replyLines({ messageId: 'r131-stranger@example.com' }));
    expect((await handleInboundEmail(stranger, multiEnv)).status).toBe('rejected');
    expect(stranger.rejected).toBe('Unknown address');

    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('r131-addr', ?, 'email', ?, 'cloudflare')`)
      .bind(TENANT.B, `bookings@${DOMAIN}`)
      .run();
    const known = fakeMessage(`Bookings@${DOMAIN}`, replyLines({ messageId: 'r131-known@example.com', text: 'enquiry for B' }));
    const outcome = await handleInboundEmail(known, multiEnv);
    expect(outcome).toMatchObject({ status: 'stored', tenantId: TENANT.B });
    expect(await count('B', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'enquiry for B'`)).toBe(1);
    expect(await count('A', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'enquiry for B'`)).toBe(0);
  });

  it('an over-size message is rejected before it is read', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A }))!;
    const msg = fakeMessage(to, replyLines({ messageId: 'r131-big@example.com' }));
    (msg as any).rawSize = MAX_INBOUND_BYTES + 1;
    expect((await handleInboundEmail(msg, multiEnv)).status).toBe('rejected');
    expect(msg.rejected).toBe('Message too large');
  });

  it('an automatic reply is accepted quietly and not filed', async () => {
    const to = (await replyAddressFor(multiEnv, { tenantId: TENANT.A, contactId: CONTACT.A }))!;
    const msg = fakeMessage(to, replyLines({ messageId: 'r131-ooo@example.com', text: 'I am away', extra: ['Auto-Submitted: auto-replied'] }));
    expect((await handleInboundEmail(msg, multiEnv)).status).toBe('ignored');
    expect(msg.rejected).toBeNull();
    expect(await count('A', `SELECT COUNT(*) AS n FROM message_log WHERE content = 'I am away'`)).toBe(0);
  });
});
