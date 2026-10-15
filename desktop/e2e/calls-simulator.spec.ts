import { test, expect } from './fixtures';
import { waitForLoad, API_URL, TENANT_ID, getAuthToken } from './helpers/auth';
import { api, seedContact, seedLead } from './helpers/api-seed';

/**
 * Whole calls played by the call simulator (TEST_MODE stacks only: POST /test/voip/simulate posts the provider's
 * signed callbacks to the real routes, on the mock provider; no telephony account is involved).
 *
 *  - an inbound call rings: the routed agent's screen shows the pop with the seeded contact
 *  - an inbound call is missed: the call-back task appears
 *  - an inbound call is answered for 45 s on a new lead: the lead moves to Contacted and the call is on its timeline
 */

const AGENCY_NUMBER = '+918047184404';

function uniqueNumber(): string {
  return `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
}

async function adminUserId(): Promise<string> {
  const token = await getAuthToken();
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).userId as string;
}

/** The agency's number must belong to the workspace, and VoIP must be set up, before a call can reach it. */
async function ensureInboundLine() {
  const settings = await api('GET', '/voip/settings');
  // The simulator signs its callbacks with the workspace's provider token. With no account id the provider stays the
  // mock (no telephony account is ever contacted), but the token lets the signature verify like a real callback's.
  await api('PUT', '/voip/settings', {
    voipProvider: 'twilio',
    providerAuthToken: 'e2e-simulator-token',
    ...(settings?.data?.defaultCallerId ? {} : { defaultCallerId: AGENCY_NUMBER }),
  });
  // 409 when already registered: fine.
  await api('POST', '/integrations/channels', { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Simulator line' });
}

async function simulate(scenario: string, from: string, durationSeconds?: number) {
  const res = await fetch(`${API_URL}/test/voip/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, to: AGENCY_NUMBER, from, durationSeconds, tenantId: TENANT_ID }),
  });
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json)).toBe(200);
  expect(json.data.steps.every((s: { status: number }) => s.status === 200)).toBe(true);
  return json.data as { callSid: string };
}

test.describe('Call simulator', () => {
  let adminId = '';

  test.beforeAll(async () => {
    adminId = await adminUserId();
    await ensureInboundLine();
  });

  test('an inbound call rings: the screen pop shows the seeded contact and their lead', async ({ page }) => {
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Pop Caller ${Date.now()}`, phone });
    const lead = await seedLead(contact.id, { title: `Pop Lead ${Date.now()}`, assignedTo: adminId });

    // The pop is pushed over the realtime socket, so the app must be connected before the phone rings.
    const socket = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/ws'), timeout: 20_000 });
    await page.goto('/dashboard');
    await waitForLoad(page);
    await socket;
    await page.waitForTimeout(500);

    await simulate('inbound_missed', phone);

    const pop = page.getByTestId('call-screen-pop');
    await expect(pop).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('call-pop-caller')).toHaveText(contact.name);
    await expect(page.getByTestId('call-pop-number')).toHaveText(phone);
    await expect(page.getByTestId('call-pop-lead')).toContainText(lead.title);
    await expect(page.getByTestId('call-pop-answer')).toHaveCount(0); // no in-app softphone yet

    await page.getByTestId('call-pop-open-lead').click();
    await page.waitForURL(new RegExp(`/leads/${lead.id}$`), { timeout: 10_000 });
    await expect(page.getByTestId('call-screen-pop')).toHaveCount(0);
  });

  test('a missed inbound call becomes a call-back task', async () => {
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Missed Caller ${Date.now()}`, phone });
    await seedLead(contact.id, { title: `Missed Lead ${Date.now()}`, assignedTo: adminId });

    await simulate('inbound_missed', phone);

    await expect
      .poll(async () => {
        const res = await api('GET', `/tasks?search=${encodeURIComponent(`Call back ${contact.name}`)}&limit=10`);
        const list: Array<{ title: string }> = res.data ?? [];
        return list.filter((t) => t.title === `Call back ${contact.name}`).length;
      }, { timeout: 20_000 })
      .toBe(1);
  });

  test('a 45 second answered call on a new lead moves it to Contacted and shows on the timeline', async ({ page }) => {
    const phone = uniqueNumber();
    const contact = await seedContact({ name: `Answered Caller ${Date.now()}`, phone });
    const lead = await seedLead(contact.id, { title: `Answered Lead ${Date.now()}`, assignedTo: adminId });
    expect(lead.status).toBe('new');

    await simulate('inbound_answered', phone, 45);

    await expect
      .poll(async () => (await api('GET', `/leads/${lead.id}`)).data?.status, { timeout: 20_000 })
      .toBe('contacted');
    await expect
      .poll(async () => {
        const res = await api('GET', `/leads/${lead.id}/activities`);
        return (res.data ?? []).filter((a: { type: string }) => a.type === 'call').length;
      }, { timeout: 20_000 })
      .toBe(1);

    await page.goto(`/leads/${lead.id}`);
    await waitForLoad(page);
    await expect(page.getByText('Inbound call, 45 s').first()).toBeVisible({ timeout: 15_000 });

    // The contact's timeline carries the same call.
    await page.goto(`/contacts/${contact.id}`);
    await waitForLoad(page);
    await expect(page.getByText('Inbound call, 45 s').first()).toBeVisible({ timeout: 15_000 });
  });
});
