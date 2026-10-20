import { type Page } from '@playwright/test';

import { API_URL } from './auth';

/**
 * Helpers for specs that need brand-new agencies (multi-tenant `--multi` stack): provisioning through the real
 * admin API, reading the temporary password from the welcome email, and completing the forced first login.
 */

export type PlanKey = 'trial' | 'basic' | 'pro' | 'enterprise';

export interface Agency {
  slug: string;
  plan: PlanKey;
  companyName: string;
  tenantId: string;
  email: string;
  temporaryPassword: string;
  /** Set by completeFirstLogin(). */
  password?: string;
  accessToken?: string;
}

/** A real platform super admin token, from the TEST_MODE route. Adapt here if super admin auth changes. */
export async function createSuperAdminToken(apiUrl: string = API_URL): Promise<string> {
  const res = await fetch(`${apiUrl}/test/super-admin`, { method: 'POST' });
  if (!res.ok) throw new Error(`test super admin failed: ${res.status}`);
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

/** POST /admin/tenants (R104), then read the temporary password from the welcome email in the local outbox. */
export async function createAgency(
  apiUrl: string,
  superAdminToken: string,
  opts: {
    plan: PlanKey;
    slug: string;
    companyName?: string;
    ownerName?: string;
    /** Defaults to an Indian agency. */
    country?: string;
    currency?: string;
    timezone?: string;
    taxSystem?: 'gst' | 'vat' | 'sales_tax' | 'none';
    region?: 'in' | 'eu' | 'uk' | 'us' | 'au' | 'gulf';
  },
): Promise<Agency> {
  const email = `owner-${opts.slug}@isolation.test`;
  const companyName = opts.companyName ?? `Agency ${opts.slug}`;
  const res = await fetch(`${apiUrl}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
    body: JSON.stringify({
      companyName,
      slug: opts.slug,
      ownerName: opts.ownerName ?? 'Isolation Owner',
      ownerEmail: email,
      plan: opts.plan,
      country: opts.country ?? 'India',
      currency: opts.currency ?? 'INR',
      timezone: opts.timezone ?? 'Asia/Kolkata',
      taxSystem: opts.taxSystem ?? 'gst',
      region: opts.region ?? 'in',
    }),
  });
  if (res.status !== 201) throw new Error(`provisioning ${opts.slug} failed: ${res.status} ${await res.text()}`);
  const tenantId = ((await res.json()) as { data: { tenantId: string } }).data.tenantId;

  const box = await fetch(`${apiUrl}/test/outbox?to=${encodeURIComponent(email)}`);
  const mails = ((await box.json()) as { data: Array<{ template: string; text: string }> }).data;
  const temporaryPassword = mails.find((m) => m.template === 'welcome_admin')?.text.match(/Temporary password:\s*(\S+)/i)?.[1];
  if (!temporaryPassword) throw new Error(`welcome email for ${email} not found in the outbox`);
  return { slug: opts.slug, plan: opts.plan, companyName, tenantId, email, temporaryPassword };
}

export async function apiLogin(apiUrl: string, agency: Agency, password: string) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: agency.email, password, tenantId: agency.tenantId }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

/**
 * The forced first login through the API: temporary password -> POST /auth/change-password (the only call a
 * temporary-password token may make) -> fresh login -> onboarding marked done so the app shell is reachable.
 */
export async function completeFirstLogin(apiUrl: string, agency: Agency): Promise<Agency> {
  const first = await apiLogin(apiUrl, agency, agency.temporaryPassword);
  if (first.status !== 200 || !first.body.data?.mustChangePassword) {
    throw new Error(`first login of ${agency.slug}: unexpected ${first.status} ${JSON.stringify(first.body)}`);
  }
  const password = `Chosen${agency.slug.replace(/[^a-z0-9]/gi, '')}9x-Voyage26`; // 12+ characters whatever the slug
  const change = await fetch(`${apiUrl}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.body.data.accessToken}` },
    body: JSON.stringify({ currentPassword: agency.temporaryPassword, newPassword: password }),
  });
  if (!change.ok) throw new Error(`change-password for ${agency.slug} failed: ${change.status} ${await change.text()}`);

  const second = await apiLogin(apiUrl, agency, password);
  if (second.status !== 200 || second.body.data.mustChangePassword) {
    throw new Error(`login of ${agency.slug} after the change failed: ${second.status}`);
  }
  const accessToken = second.body.data.accessToken as string;
  const skip = await fetch(`${apiUrl}/settings/company`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ company_name: agency.companyName, onboarding_completed: 'true' }),
  });
  if (!skip.ok) throw new Error(`skipping onboarding for ${agency.slug} failed: ${skip.status}`);
  return { ...agency, password, accessToken };
}

export interface ApiResult {
  status: number;
  json: any;
  text: string;
}

/** One JSON request to the API with an optional bearer token; never throws on an HTTP error status. */
export async function request(
  apiUrl: string,
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text };
}

export interface OutboxMail {
  id: string;
  to: string;
  subject: string;
  template: string;
  text: string;
  html: string;
}

/** Emails captured by the local outbox (TEST_MODE) for one address, newest data as the API returns it. */
export async function outboxFor(apiUrl: string, to: string): Promise<OutboxMail[]> {
  const res = await request(apiUrl, 'GET', `/test/outbox?to=${encodeURIComponent(to)}`, null);
  return (res.json?.data ?? []) as OutboxMail[];
}

export type UserRole = 'admin' | 'sales_manager' | 'salesperson' | 'operations' | 'accountant' | 'view_only';

/** POST /users as the agency admin. Returns the raw result so a caller can assert a refusal (seat limit). */
export function inviteUser(apiUrl: string, admin: Agency, user: { email: string; name: string; role: UserRole }): Promise<ApiResult> {
  return request(apiUrl, 'POST', '/users', admin.accessToken!, user);
}

/** The invitation link in the invitee's email, from the local outbox. */
export async function inviteTokenFor(apiUrl: string, email: string): Promise<string> {
  const mail = (await outboxFor(apiUrl, email)).find((m) => m.template === 'invite_user');
  const token = mail?.text.match(/setup-account\?token=([A-Za-z0-9-]+)/)?.[1];
  if (!token) throw new Error(`invitation email for ${email} not found in the outbox`);
  return token;
}

/** The invitee's side of an invitation, through the API (POST /auth/setup-account). */
export function acceptInvite(apiUrl: string, token: string, name: string, password: string): Promise<ApiResult> {
  return request(apiUrl, 'POST', '/auth/setup-account', null, { token, name, password });
}

/** Sign in through the real login form (email step, then password). Retries the click until the page is hydrated. */
export async function signInViaUI(page: Page, agency: Agency): Promise<void> {
  if (!agency.password) throw new Error('call completeFirstLogin() first');
  await page.goto('/login');
  await page.waitForSelector('text=Welcome back');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#email').fill(agency.email);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForSelector('#password', { timeout: 5_000 });
      break;
    } catch {
      /* not hydrated yet */
    }
  }
  await page.waitForSelector('#password', { timeout: 15_000 });
  await page.locator('#password').fill(agency.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
}
