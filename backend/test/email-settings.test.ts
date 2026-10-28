import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';
import { providerFor, sendMail, type MailKind } from '../src/services/mail/provider';
import { sendTransactional } from '../src/services/mail/transactional';
import { getEmailSettings, updateEmailSettings } from '../src/services/mail/settings';
import { applyPlatformEmailEvent, listPlatformMail, maskAddress, purgePlatformMailLog, recordPlatformMail } from '../src/services/mail/platform-log';
import { replyAddressFor } from '../src/services/mail/reply-token';
import { handleEmailJob } from '../src/queues/email-queue';
import campaignQueueSource from '../src/queues/campaign-queue.ts?raw';
import emailQueueSource from '../src/queues/email-queue.ts?raw';

const testEnv = env as any;
const master = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);

const SUPER_ID = '0196a132-0000-7000-8000-0000000000a1';
const SUPER_EMAIL = 'super-r132@platform.test';

let superToken = '';

interface Row {
  [k: string]: any;
}

async function rows(sql: string, ...binds: unknown[]): Promise<Row[]> {
  return ((await master(sql, ...binds).all<Row>()).results ?? []) as Row[];
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

function binding(impl?: (msg: any) => Promise<any>) {
  return { send: vi.fn(impl ?? (async () => ({ messageId: 'cf-msg-1' }))) };
}

function liveEnv(extra: Record<string, unknown> = {}): any {
  return { ...testEnv, TEST_MODE: 'false', SENDGRID_API_KEY: 'SG.test', EMAIL_FROM: 'noreply@platform.example', EMAIL_FROM_NAME: 'Platform', ...extra };
}

function sendgridOk(id = 'sg-msg-1') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202, headers: { 'x-message-id': id } }));
}

async function resetSettings() {
  await master("DELETE FROM platform_settings WHERE key LIKE 'email.%'").run();
  await testEnv.CACHE?.delete('email:settings:v1');
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  superToken = await superAdminToken(testEnv, { id: SUPER_ID, email: SUPER_EMAIL, name: 'R132 Super' });
});

beforeEach(async () => {
  await resetSettings();
  await master('DELETE FROM platform_email_log').run();
});

afterEach(() => vi.restoreAllMocks());

describe('email defaults and resolution order (R132)', () => {
  it('with nothing configured platform mail tries Cloudflare, and falls back to SendGrid without a binding, saying why', async () => {
    const settings = await getEmailSettings(liveEnv());
    expect(settings).toMatchObject({ systemProvider: 'cloudflare', fallback: true, inboundEnabled: true });
    expect(settings.source.systemProvider).toBe('default');

    const b = binding();
    const withBinding = liveEnv({ EMAIL: b });
    expect(providerFor(withBinding, 'platform_system', await getEmailSettings(withBinding)).name).toBe('cloudflare');

    const spy = sendgridOk();
    const res = await sendMail(liveEnv(), 'platform_system', { to: 'person@example.com', subject: 'Hi', html: '<p>x</p>', category: 'welcome_admin' });
    expect(res).toMatchObject({ success: true, provider: 'sendgrid', fallbackFrom: 'cloudflare', messageId: 'sg-msg-1' });
    expect(spy).toHaveBeenCalledTimes(1);

    const log = await listPlatformMail(testEnv);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ provider: 'sendgrid', fallbackFrom: 'cloudflare', status: 'fallback', template: 'welcome_admin', messageId: 'sg-msg-1' });
    expect(log[0].note).toContain('binding is not present');
  });

  it('the console setting beats the variable, and the variable beats the built-in default', async () => {
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'sendgrid' });
    expect(await getEmailSettings(e)).toMatchObject({ systemProvider: 'sendgrid', source: { systemProvider: 'env' } });
    await updateEmailSettings(e, { systemProvider: 'cloudflare' }, 'op@platform.test');
    expect(await getEmailSettings(e)).toMatchObject({ systemProvider: 'cloudflare', source: { systemProvider: 'console' } });
    await updateEmailSettings(liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare' }), { systemProvider: 'sendgrid' }, 'op@platform.test');
    expect(await getEmailSettings(liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare' }))).toMatchObject({ systemProvider: 'sendgrid', source: { systemProvider: 'console' } });
    // mock is a local-stack variable and cannot be overridden from the console
    expect(await getEmailSettings(liveEnv({ EMAIL_SYSTEM_PROVIDER: 'mock' }))).toMatchObject({ systemProvider: 'mock' });
  });

  it('a console change is audited with actor and reason, takes effect at once, and needs a reason', async () => {
    await master("DELETE FROM super_admin_audit_log WHERE action = 'email.settings_update'").run();
    const noReason = await call('PUT', '/admin/email/settings', { systemProvider: 'sendgrid' });
    expect(noReason.status).toBe(400);

    const before = await call('GET', '/admin/email');
    expect(((await before.json()) as any).data.settings.systemProvider).toBe('cloudflare');

    const res = await call('PUT', '/admin/email/settings', { systemProvider: 'sendgrid', fallback: false, reason: 'Cloudflare onboarding not finished' });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.settings).toMatchObject({ systemProvider: 'sendgrid', fallback: false, source: { systemProvider: 'console' } });
    // the next read sees it without waiting for the cache to expire
    expect(await getEmailSettings(testEnv)).toMatchObject({ systemProvider: 'sendgrid', fallback: false });

    const audit = await rows("SELECT entity_id, details FROM super_admin_audit_log WHERE action = 'email.settings_update'");
    expect(audit).toHaveLength(1);
    const details = JSON.parse(audit[0].details);
    expect(details.actor).toBe(SUPER_EMAIL);
    expect(details.reason).toBe('Cloudflare onboarding not finished');
    expect(details.before).toMatchObject({ systemProvider: 'cloudflare', fallback: true });
    expect(details.after).toMatchObject({ systemProvider: 'sendgrid', fallback: false });
  });

  it('with the console set to SendGrid, platform mail never touches the Cloudflare binding', async () => {
    await updateEmailSettings(testEnv, { systemProvider: 'sendgrid' }, null);
    const b = binding();
    const spy = sendgridOk();
    const res = await sendMail(liveEnv({ EMAIL: b }), 'platform_system', { to: 'p@example.com', subject: 'S', html: '<p>x</p>' });
    expect(res).toMatchObject({ success: true, provider: 'sendgrid' });
    expect(res.fallbackFrom).toBeUndefined();
    expect(b.send).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('with the fallback switched off a Cloudflare refusal is not retried on SendGrid and is logged as failed', async () => {
    await updateEmailSettings(testEnv, { fallback: false }, null);
    const b = binding(async () => {
      throw Object.assign(new Error('not onboarded'), { code: 'E_SENDER_DOMAIN_NOT_AVAILABLE' });
    });
    const spy = sendgridOk();
    const res = await sendMail(liveEnv({ EMAIL: b }), 'platform_system', { to: 'p@example.com', subject: 'S', html: '<p>x</p>' });
    expect(res.success).toBe(false);
    expect(res.provider).toBe('cloudflare');
    expect(spy).not.toHaveBeenCalled();
    const log = await listPlatformMail(testEnv);
    expect(log[0]).toMatchObject({ status: 'failed', provider: 'cloudflare' });
    expect(log[0].error).toContain('E_SENDER_DOMAIN_NOT_AVAILABLE');
    expect(log[0].note).toContain('fallback is switched off');
    // and with no binding at all the failure says so
    const none = await sendMail(liveEnv(), 'platform_system', { to: 'p@example.com', subject: 'S', html: '<p>x</p>' });
    expect(none).toMatchObject({ success: false, provider: 'cloudflare' });
    expect(none.error).toContain('not configured');
  });

  it('marketing never routes to Cloudflare, whatever the console, variable or fallback setting says', async () => {
    const b = binding();
    const spy = sendgridOk();
    const kinds: MailKind[] = ['agency_marketing', 'agency_transactional'];
    for (const consoleValue of ['cloudflare', 'sendgrid'] as const) {
      for (const fallback of [true, false]) {
        await updateEmailSettings(testEnv, { systemProvider: consoleValue, fallback }, null);
        for (const variable of ['cloudflare', 'sendgrid', 'mock', undefined]) {
          const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: variable, EMAIL: b });
          const settings = await getEmailSettings(e);
          expect(providerFor(e, 'agency_marketing', settings).name).toBe('sendgrid');
          for (const kind of kinds) {
            const res = await sendMail(e, kind, { to: 'c@example.com', subject: 'Offer', html: '<p>x</p>', unsubscribeUrl: 'https://x/u' });
            expect(res.provider).toBe('sendgrid');
          }
        }
      }
    }
    expect(b.send).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(2 * 2 * 4 * 2);
    // agency mail is not written to the platform log
    expect(await listPlatformMail(testEnv)).toHaveLength(0);
  });
});

describe('queue sends go through sendMail (gap 2)', () => {
  it('neither queue calls the SendGrid API directly any more', () => {
    expect(campaignQueueSource).not.toContain('api.sendgrid.com');
    expect(campaignQueueSource).toContain("sendMail(env, 'agency_marketing'");
    expect(emailQueueSource).not.toContain('sendWithTemplate');
    expect(emailQueueSource).toContain('sendMail(');
  });

  it('a template send keeps its template id, data, reply-to, unsubscribe headers and message id', async () => {
    const b = binding();
    const spy = sendgridOk('tpl-msg-9');
    const e = liveEnv({ EMAIL_SYSTEM_PROVIDER: 'cloudflare', EMAIL: b });
    await handleEmailJob(
      {
        to: 'c@example.com',
        subject: 'ignored for templates',
        templateId: 'd-123',
        templateData: { name: 'Asha' },
        replyTo: 'reply+abc@in.example.com',
        unsubscribeUrl: 'https://api.example.test/u/tok',
      },
      e,
    );
    expect(b.send).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.template_id).toBe('d-123');
    expect(payload.personalizations[0].dynamic_template_data).toMatchObject({ name: 'Asha', unsubscribeUrl: 'https://api.example.test/u/tok' });
    expect(payload.reply_to).toEqual({ email: 'reply+abc@in.example.com' });
    expect(payload.headers['List-Unsubscribe']).toBe('<https://api.example.test/u/tok>');
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('a plain direct send keeps its html, reply-to and unsubscribe footer and headers', async () => {
    const spy = sendgridOk('direct-1');
    await handleEmailJob({ to: 'c@example.com', subject: 'Deal', html: '<p>Hi</p>', replyTo: 'agent@agency.test', unsubscribeUrl: 'https://u.test/x' }, liveEnv({ EMAIL: binding() }));
    const payload = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.subject).toBe('Deal');
    expect(payload.reply_to).toEqual({ email: 'agent@agency.test' });
    expect(payload.content[0].value).toContain('https://u.test/x');
    expect(payload.headers['List-Unsubscribe']).toBe('<https://u.test/x>');
  });
});

describe('platform email log (gap 1)', () => {
  it('records sent, failed and fallback rows with the address masked', async () => {
    const e1 = liveEnv({ EMAIL: binding() });
    await sendMail(e1, 'platform_system', { to: 'jane.doe@example.com', subject: 'S', html: '<p>x</p>', category: 'reset_password' });
    const failing = binding(async () => {
      throw Object.assign(new Error('limit'), { code: 'E_DAILY_LIMIT_EXCEEDED' });
    });
    sendgridOk('fb-1');
    await sendMail(liveEnv({ EMAIL: failing }), 'platform_system', { to: 'bob@example.com', subject: 'S', html: '<p>x</p>', category: 'invite_user' });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 500 }));
    await sendMail(liveEnv({ EMAIL: failing }), 'platform_system', { to: 'zed@example.com', subject: 'S', html: '<p>x</p>', category: 'usage_alert' });

    const log = await listPlatformMail(testEnv, { limit: 10 });
    const byTemplate = Object.fromEntries(log.map((r) => [r.template, r]));
    expect(byTemplate.reset_password).toMatchObject({ status: 'sent', provider: 'cloudflare', deliveryStatus: 'accepted', messageId: 'cf-msg-1', to: 'j***@example.com' });
    expect(byTemplate.invite_user).toMatchObject({ status: 'fallback', provider: 'sendgrid', fallbackFrom: 'cloudflare', messageId: 'fb-1' });
    expect(byTemplate.invite_user.note).toContain('E_DAILY_LIMIT_EXCEEDED');
    expect(byTemplate.usage_alert.status).toBe('failed');
    expect(byTemplate.usage_alert.error).toContain('500');
    // the full address is stored nowhere in the row
    const raw = JSON.stringify(await rows('SELECT * FROM platform_email_log'));
    expect(raw).not.toContain('jane.doe');
    expect(raw).not.toContain('bob@');
    expect(maskAddress('Jane <jane@Example.com>')).toBe('j***@example.com');
    expect(maskAddress('not an address')).toBe('***');
  });

  it('the local outbox path is logged as an outbox row', async () => {
    const res = await sendTransactional(testEnv, { to: 'local@example.com', template: 'password_changed' });
    expect(res.via).toBe('outbox');
    const log = await listPlatformMail(testEnv);
    expect(log[0]).toMatchObject({ provider: 'outbox', status: 'sent', template: 'password_changed' });
    expect(log[0].note).toContain('nothing was sent');
  });

  it('SendGrid events update the row by message id, only forward; Cloudflare rows stay accepted', async () => {
    sendgridOk('sg-evt-1');
    await updateEmailSettings(testEnv, { systemProvider: 'sendgrid' }, null);
    await sendMail(liveEnv(), 'platform_system', { to: 'a@example.com', subject: 'S', html: '<p>x</p>', category: 'welcome_admin' });
    await recordPlatformMail(testEnv, { template: 'x', to: 'c@example.com', provider: 'cloudflare', messageId: 'cf-only', status: 'sent' });

    expect(await applyPlatformEmailEvent(testEnv, { event: 'delivered', sg_message_id: 'sg-evt-1.filter0001.1' }, ['sg-evt-1', 'sg-evt-1.filter0001.1'])).toBe(true);
    let row = (await rows("SELECT delivery_status FROM platform_email_log WHERE message_id = 'sg-evt-1'"))[0];
    expect(row.delivery_status).toBe('delivered');
    await applyPlatformEmailEvent(testEnv, { event: 'processed' }, ['sg-evt-1']); // late, ignored
    row = (await rows("SELECT delivery_status FROM platform_email_log WHERE message_id = 'sg-evt-1'"))[0];
    expect(row.delivery_status).toBe('delivered');
    await applyPlatformEmailEvent(testEnv, { event: 'bounce', reason: '550 no such user' }, ['sg-evt-1']);
    row = (await rows("SELECT delivery_status, error FROM platform_email_log WHERE message_id = 'sg-evt-1'"))[0];
    expect(row).toMatchObject({ delivery_status: 'bounced', error: '550 no such user' });
    expect(await applyPlatformEmailEvent(testEnv, { event: 'delivered' }, ['unknown-id'])).toBe(false);
    expect((await rows("SELECT delivery_status FROM platform_email_log WHERE message_id = 'cf-only'"))[0].delivery_status).toBe('accepted');
  });

  it('the SendGrid event webhook reaches the platform log', async () => {
    sendgridOk('sg-hook-1');
    await updateEmailSettings(testEnv, { systemProvider: 'sendgrid' }, null);
    await sendMail(liveEnv(), 'platform_system', { to: 'hook@example.com', subject: 'S', html: '<p>x</p>' });
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/webhooks/sendgrid/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ event: 'delivered', email: 'hook@example.com', sg_message_id: 'sg-hook-1.filter.0' }]),
      }),
      { ...testEnv, TEST_MODE: 'true' },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect((await rows("SELECT delivery_status FROM platform_email_log WHERE message_id = 'sg-hook-1'"))[0].delivery_status).toBe('delivered');
  });

  it('keeps rows for 90 days and the daily purge removes older ones', async () => {
    await recordPlatformMail(testEnv, { template: 'old', to: 'o@example.com', provider: 'sendgrid', status: 'sent' });
    await recordPlatformMail(testEnv, { template: 'new', to: 'n@example.com', provider: 'sendgrid', status: 'sent' });
    const old = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString();
    await master("UPDATE platform_email_log SET created_at = ? WHERE template = 'old'", old).run();
    const edge = new Date(Date.now() - 89 * 24 * 3600 * 1000).toISOString();
    await recordPlatformMail(testEnv, { template: 'edge', to: 'e@example.com', provider: 'sendgrid', status: 'sent' });
    await master("UPDATE platform_email_log SET created_at = ? WHERE template = 'edge'", edge).run();
    expect(await purgePlatformMailLog(testEnv)).toBe(1);
    const left = (await rows('SELECT template FROM platform_email_log ORDER BY template')).map((r) => r.template);
    expect(left).toEqual(['edge', 'new']);
  });

  it('the console reads the log and filters by status', async () => {
    await recordPlatformMail(testEnv, { template: 'a', to: 'a@example.com', provider: 'sendgrid', status: 'sent' });
    await recordPlatformMail(testEnv, { template: 'b', to: 'b@example.com', provider: 'cloudflare', status: 'failed', error: 'x' });
    const all = ((await (await call('GET', '/admin/email/log')).json()) as any).data;
    expect(all.rows).toHaveLength(2);
    expect(all.retentionDays).toBe(90);
    const failed = ((await (await call('GET', '/admin/email/log?status=failed')).json()) as any).data.rows;
    expect(failed.map((r: Row) => r.template)).toEqual(['b']);
  });
});

describe('console Email page API', () => {
  it('shows the routing per mail kind and why marketing cannot use Cloudflare', async () => {
    const data = ((await (await call('GET', '/admin/email')).json()) as any).data;
    const byKind = Object.fromEntries(data.routing.map((r: Row) => [r.kind, r]));
    expect(byKind.agency_marketing).toMatchObject({ provider: 'sendgrid', mayUseCloudflare: false });
    expect(byKind.agency_marketing.why).toContain('transactional only');
    expect(byKind.agency_transactional.provider).toBe('sendgrid');
    expect(byKind.platform_system.mayUseCloudflare).toBe(true);
    expect(data.status).toHaveProperty('cloudflareBinding');
    expect(data.status).toHaveProperty('sendgridKey');
    expect(data.status).toHaveProperty('inboundDomain');
  });

  it('sends a test email into the outbox on a local stack and audits it', async () => {
    const res = await call('POST', '/admin/email/test', { to: 'owner@example.com' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toMatchObject({ delivered: true, via: 'outbox', outbox: true });
    expect((await call('POST', '/admin/email/test', { to: 'not-an-email' })).status).toBe(400);
  });

  it('requires a super admin', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://localhost/api/v1/admin/email'), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('the inbound switch stops new reply addresses', async () => {
    const e = liveEnv({ EMAIL_INBOUND_DOMAIN: 'in.example.com' });
    const thread = { tenantId: 't-r132', contactId: 'c-r132' };
    expect(await replyAddressFor(e, thread)).toMatch(/^reply\+[a-z2-7]{24}@in\.example\.com$/);
    await updateEmailSettings(e, { inboundEnabled: false }, null);
    expect(await replyAddressFor(e, { tenantId: 't-r132', contactId: 'c-other' })).toBeNull();
    await updateEmailSettings(e, { inboundEnabled: true }, null);
    expect(await replyAddressFor(e, { tenantId: 't-r132', contactId: 'c-other' })).not.toBeNull();
  });
});
