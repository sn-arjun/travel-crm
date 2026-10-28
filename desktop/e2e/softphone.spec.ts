import { test, expect } from './fixtures';
import { waitForLoad, API_URL, TENANT_ID, getAuthToken } from './helpers/auth';
import { api, seedContact, seedLead } from './helpers/api-seed';

/**
 * The in-app phone (R307) on the mock softphone (VOIP_PROVIDER mock: no microphone, no telephony account) with the
 * call simulator playing the provider's side.
 *
 *  - an agency without calling: no token, the phone is `unavailable`, the pop has no Answer
 *  - calling on: an inbound ring -> Answer -> in-call panel with a running timer -> hang up -> the call is on the lead's timeline
 *  - calling on: Call from a lead -> the in-call panel opens with the lead and the note box; mute works
 *  - the microphone check opens from the dial pad
 *
 * The agency is switched back to "no calling" at the end so specs that expect the plain pop are not affected.
 */

const AGENCY_NUMBER = '+918047184404';

function uniqueNumber(): string {
  return `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
}

async function adminUserId(): Promise<string> {
  const token = await getAuthToken();
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).userId as string;
}

async function superAdminToken(): Promise<string> {
  const res = await fetch(`${API_URL}/test/super-admin`, { method: 'POST' });
  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

async function adminPost(path: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await superAdminToken()}`, 'Content-Type': 'application/json' }, body: '{}' });
}

async function tokenStatus(): Promise<number> {
  const res = await fetch(`${API_URL}/voip/token`, { headers: { Authorization: `Bearer ${await getAuthToken()}` } });
  return res.status;
}

/** The workspace's number and caller id, the same set-up the call simulator spec uses. */
async function ensureInboundLine() {
  const settings = await api('GET', '/voip/settings');
  await api('PUT', '/voip/settings', {
    voipProvider: 'twilio',
    providerAuthToken: 'e2e-simulator-token',
    ...(settings?.data?.defaultCallerId ? {} : { defaultCallerId: AGENCY_NUMBER }),
  });
  await api('POST', '/integrations/channels', { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Simulator line' });
}

/** Calling on for the agency: one sub-account (resumed if an earlier run suspended it). */
async function turnCallingOn() {
  await adminPost(`/admin/tenants/${TENANT_ID}/voip/resume`);
  const enabled = await api('POST', '/voip/account/enable', {});
  expect(enabled.success, JSON.stringify(enabled)).toBe(true);
  await expect.poll(tokenStatus, { timeout: 15_000 }).toBe(200);
}

async function turnCallingOff() {
  const res = await adminPost(`/admin/tenants/${TENANT_ID}/voip/suspend`);
  expect([200, 404, 409], await res.clone().text()).toContain(res.status); // 409: no account to suspend
}

async function simulate(scenario: string, from: string, opts: { durationSeconds?: number; callSid?: string } = {}) {
  const res = await fetch(`${API_URL}/test/voip/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, to: AGENCY_NUMBER, from, tenantId: TENANT_ID, ...opts }),
  });
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json)).toBe(200);
  expect(json.data.steps.every((s: { status: number }) => s.status === 200), JSON.stringify(json.data.steps)).toBe(true);
  return json.data as { callSid: string };
}

test.describe('Softphone', () => {
  let adminId = '';

  test.beforeAll(async () => {
    adminId = await adminUserId();
    await ensureInboundLine();
    await turnCallingOff(); // start from "no calling" whatever an earlier run left
  });

  test.afterAll(async () => {
    // Leave the agency as it was before this spec: no calling account (closed, not suspended), so later specs
    // see the plain pop and a number search can turn calling on again.
    const res = await adminPost(`/admin/tenants/${TENANT_ID}/voip/close`);
    expect([200, 404, 409], await res.clone().text()).toContain(res.status);
  });

  test('an agency without calling gets no token and no phone: the pop has no Answer', async ({ page }) => {
    expect(await tokenStatus()).toBe(403);

    const phone = uniqueNumber();
    const contact = await seedContact({ name: `NoCall Caller ${Date.now()}`, phone });
    await seedLead(contact.id, { title: `NoCall Lead ${Date.now()}`, assignedTo: adminId });

    // R135-5: where calling is off the app never even asks for a token (no 403 on every page).
    const tokenRequests: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/voip/token')) tokenRequests.push(req.url()); });

    const socket = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/ws'), timeout: 20_000 });
    await page.goto('/dashboard');
    await waitForLoad(page);
    await socket;
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('softphone-state')).toHaveCount(0);
    expect(tokenRequests).toEqual([]);

    await simulate('inbound_missed', phone);
    await expect(page.getByTestId('call-screen-pop')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('call-pop-answer')).toHaveCount(0);
    await expect(page.getByTestId('call-pop-decline')).toHaveCount(0);

    // And no phone controls on the dial pad.
    await page.goto('/communication/calls/dial');
    await waitForLoad(page);
    await expect(page.getByTestId('softphone-mic-check')).toHaveCount(0);
  });

  test('inbound: ring, Answer, the panel counts up with the lead beside it, hang up, the call is on the lead timeline', async ({ page }) => {
    await turnCallingOn();
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Ring Caller ${Date.now()}`, phone });
    const lead = await seedLead(contact.id, { title: `Ring Lead ${Date.now()}`, assignedTo: adminId });

    const socket = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/ws'), timeout: 20_000 });
    await page.goto('/dashboard');
    await waitForLoad(page);
    await socket;
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready', { timeout: 20_000 });
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-kind', 'mock');

    const { callSid } = await simulate('inbound_ring', phone);

    const pop = page.getByTestId('call-screen-pop');
    await expect(pop).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('call-pop-caller')).toHaveText(contact.name);
    await expect(page.getByTestId('call-pop-lead')).toContainText(lead.title);
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ringing');
    await page.getByTestId('call-pop-answer').click();

    // The pop gives way to the in-call panel; the timer runs; the lead is one click away.
    await expect(pop).toHaveCount(0);
    const panel = page.getByTestId('call-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-call-status', 'connected', { timeout: 10_000 });
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'in_call');
    await expect(page.getByTestId('call-panel-timer')).not.toHaveText('00:00', { timeout: 10_000 });
    await expect(page.getByTestId('call-panel-lead')).toContainText(lead.title);

    // Mute and hold change the call; the note is kept.
    await page.getByTestId('call-panel-mute').click();
    await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
    await page.getByTestId('call-panel-hold').click();
    await expect(panel).toHaveAttribute('data-call-status', 'on_hold');
    await page.getByTestId('call-panel-hold').click();
    await expect(panel).toHaveAttribute('data-call-status', 'connected');
    await page.getByTestId('call-panel-note').fill('Wants a week in Goa in March');

    // Hang up: the audio ends, the outcome dialog opens and saves the note with the call.
    await page.getByTestId('call-panel-hangup').click();
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready');
    await expect(panel).toHaveAttribute('data-call-status', 'ended');
    await page.getByRole('button', { name: 'Log & close' }).click();
    await expect(panel).toHaveCount(0);

    // The provider reports the finished call: it lands on the lead's timeline and the note is on the call.
    await simulate('inbound_finish', phone, { callSid, durationSeconds: 45 });
    await expect
      .poll(async () => {
        const res = await api('GET', `/leads/${lead.id}/activities`);
        return (res.data ?? []).filter((a: { type: string }) => a.type === 'call').length;
      }, { timeout: 20_000 })
      .toBe(1);
    const calls = await api('GET', `/calls?search=${encodeURIComponent(phone)}&limit=10`);
    const row = (calls.data ?? []).find((c: { providerCallId?: string }) => c.providerCallId === callSid);
    expect(row?.notes).toContain('Wants a week in Goa in March');

    await page.goto(`/leads/${lead.id}`);
    await waitForLoad(page);
    await expect(page.getByText('Inbound call, 45 s').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Decline turns the call away: the pop clears and the phone is ready again', async ({ page }) => {
    await turnCallingOn();
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Quick Caller ${Date.now()}`, phone });
    await seedLead(contact.id, { title: `Quick Lead ${Date.now()}`, assignedTo: adminId });

    const socket = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/ws'), timeout: 20_000 });
    await page.goto('/dashboard');
    await waitForLoad(page);
    await socket;
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready', { timeout: 20_000 });

    await simulate('inbound_missed', phone);
    await expect(page.getByTestId('call-pop-answer')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('call-pop-decline').click();
    await expect(page.getByTestId('call-screen-pop')).toHaveCount(0);
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready');
  });

  test('outbound from a lead: the panel opens with the lead, the phone answers its own leg, mute works', async ({ page }) => {
    await turnCallingOn();
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Out Contact ${Date.now()}`, phone });
    const lead = await seedLead(contact.id, { title: `Out Lead ${Date.now()}`, assignedTo: adminId });

    await page.goto(`/communication/calls/dial?phone=${encodeURIComponent(phone)}&leadId=${lead.id}&contactId=${contact.id}`);
    await waitForLoad(page);
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready', { timeout: 20_000 });
    await expect(page.getByTestId('softphone-status')).toContainText('Phone ready');

    await page.getByRole('button', { name: 'Call', exact: true }).click();

    const panel = page.getByTestId('call-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('call-panel-lead')).toContainText(lead.title);
    await expect(page.getByTestId('call-panel-note')).toBeVisible();
    // The server rang the app first and the app answered that leg by itself.
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'in_call', { timeout: 10_000 });
    await page.getByTestId('call-panel-mute').click();
    await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();

    // The call record carries the lead.
    await expect
      .poll(async () => {
        const res = await api('GET', `/calls?search=${encodeURIComponent(phone)}&limit=10`);
        return (res.data ?? [])[0]?.leadId ?? null;
      }, { timeout: 15_000 })
      .toBe(lead.id);

    await page.getByTestId('call-panel-hangup').click();
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('the microphone check opens from the dial pad and reports on the connection', async ({ page }) => {
    await turnCallingOn();
    await page.goto('/communication/calls/dial');
    await waitForLoad(page);
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready', { timeout: 20_000 });
    await page.getByTestId('softphone-mic-check').click();

    const check = page.getByTestId('mic-check');
    await expect(check).toBeVisible();
    // This browser has no real microphone: either it listens or it explains why it cannot, never a crash.
    await page.getByTestId('mic-check-start').click();
    await expect(check).not.toHaveAttribute('data-mic-state', /^(idle|requesting)$/, { timeout: 10_000 });
    await page.getByTestId('mic-check-network').click();
    await expect(page.getByTestId('mic-check-quality')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('mic-check-done').click();
    await expect(check).toHaveCount(0);
  });
});
