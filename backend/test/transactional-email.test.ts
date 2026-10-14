import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { sendTransactional } from '../src/services/mail/transactional';
import { renderTemplate, type TemplateName } from '../src/services/mail/templates';
import { appUrl, quoteUrl, emailFrom } from '../src/utils/app-urls';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
// No SendGrid key: system email lands in the local outbox.
const outboxEnv = { ...testEnv, SENDGRID_API_KEY: '' };

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = outboxEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('transactional email', () => {
  let admin = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    await call('DELETE', '/test/outbox', null);
  });

  afterEach(() => vi.restoreAllMocks());

  it('inviting a user writes one invite email whose link points at APP_URL, and still returns inviteUrl', async () => {
    const res = await call('POST', '/users', admin, { email: 'invitee-r102@e2e.test', name: 'Invitee', role: 'salesperson' });
    expect(res.status).toBe(201);
    const inviteUrl = ((await res.json()) as any).data.inviteUrl as string;
    expect(inviteUrl.startsWith(`${testEnv.APP_URL}/setup-account?token=`)).toBe(true);

    const list = await call('GET', '/test/outbox?to=invitee-r102@e2e.test', null);
    expect(list.status).toBe(200);
    const mails = ((await list.json()) as any).data;
    expect(mails).toHaveLength(1);
    expect(mails[0].template).toBe('invite_user');
    expect(mails[0].html).toContain(`${testEnv.APP_URL}/setup-account?token=`);
    expect(mails[0].text).toContain(inviteUrl);
  });

  it('forgot-password writes a reset email; an unknown address writes nothing', async () => {
    expect((await call('POST', '/auth/forgot-password', null, { email: 'admin@e2e.test' })).status).toBe(200);
    expect((await call('POST', '/auth/forgot-password', null, { email: 'nobody-r102@e2e.test' })).status).toBe(200);

    const mails = ((await (await call('GET', '/test/outbox?to=admin@e2e.test', null)).json()) as any).data;
    const reset = mails.find((m: any) => m.template === 'reset_password');
    expect(reset.html).toContain(`${testEnv.APP_URL}/reset-password?token=`);
    const none = ((await (await call('GET', '/test/outbox?to=nobody-r102@e2e.test', null)).json()) as any).data;
    expect(none).toHaveLength(0);
  });

  it('the outbox lists newest first and DELETE clears it', async () => {
    const all = ((await (await call('GET', '/test/outbox', null)).json()) as any).data;
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ids = all.map((m: any) => m.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect((await call('DELETE', '/test/outbox', null)).status).toBe(200);
    expect(((await (await call('GET', '/test/outbox', null)).json()) as any).data).toHaveLength(0);
  });

  it('the outbox endpoints answer 404 unless TEST_MODE is true', async () => {
    const off = { ...outboxEnv, TEST_MODE: 'false' };
    expect((await call('GET', '/test/outbox', null, undefined, off)).status).toBe(404);
    expect((await call('DELETE', '/test/outbox', null, undefined, off)).status).toBe(404);
  });

  it('with a SendGrid key and TEST_MODE off, the email goes to SendGrid from the configured sender', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202 }));
    const live = { ...testEnv, SENDGRID_API_KEY: 'SG.live-test', TEST_MODE: 'false', EMAIL_FROM: 'hello@agency.example', EMAIL_FROM_NAME: 'Agency Mail' };
    const result = await sendTransactional(live, { to: 'person@example.com', template: 'reset_password', data: { resetUrl: 'http://x/reset' } });
    expect(result).toMatchObject({ delivered: true, via: 'sendgrid' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    const body = JSON.parse(init.body as string);
    expect(body.from).toEqual({ email: 'hello@agency.example', name: 'Agency Mail' });
    expect(body.personalizations[0].to).toEqual([{ email: 'person@example.com' }]);
  });

  it('a SendGrid failure is reported, not thrown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const live = { ...testEnv, SENDGRID_API_KEY: 'SG.live-test', TEST_MODE: 'false' };
    const result = await sendTransactional(live, { to: 'p@example.com', template: 'password_changed' });
    expect(result.delivered).toBe(false);
  });

  it('config helpers fall back to local defaults and the welcome email carries login, password and download link', () => {
    expect(appUrl({ APP_URL: 'https://crm.example/' })).toBe('https://crm.example');
    expect(appUrl({})).toBe('http://localhost:3100');
    expect(quoteUrl({ APP_URL: 'https://crm.example' }, 'tok')).toBe('https://crm.example/q/tok');
    expect(quoteUrl({ QUOTES_URL: 'https://q.example/' }, 'tok')).toBe('https://q.example/tok');
    expect(emailFrom({})).toEqual({ email: 'noreply@localhost.test', name: 'TravelCRM Pro' });

    const welcome = renderTemplate('welcome_admin', { appUrl: 'https://crm.example', agencyName: 'Acme', email: 'a@acme.test', temporaryPassword: 'Temp-123' });
    expect(welcome.html).toContain('Temp-123');
    expect(welcome.html).toContain('https://crm.example/download');
    expect(welcome.text).toContain('a@acme.test');
  });

  it('no template output mentions travelcrm.pro', () => {
    const names: TemplateName[] = ['welcome_admin', 'invite_user', 'reset_password', 'password_changed', 'platform_enquiry'];
    for (const n of names) {
      const out = renderTemplate(n, { appUrl: 'http://localhost:3100', agencyName: 'A', email: 'e@x.test', name: 'N', setupUrl: 'u', resetUrl: 'u' });
      expect(out.subject + out.html + out.text).not.toContain('travelcrm.pro');
    }
  });
});
