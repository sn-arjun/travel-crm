/**
 * Film automations-calls: what the assistant does after a call (studio/clips/automations-calls.json, docs/CALL-AUTOMATION.md).
 * Calls are played by the call simulator (POST /test/voip/simulate) on the mock provider: no telephony account is contacted.
 */
// Calling is not offered to Indian agencies, so this film runs on the UK film agency B (multi-agency stack, film-prep --agencies).
import { actorTenant, admin, agency, api, asAgency, beat, callingOn, clickOn, ensureInboundLine, expect, findOne, focus, glance, pause, recordFilm, rows, search, setActor, settle, simulateCall, visit } from './film-kit';

const test = asAgency('B');
const PRIYA = '+447700900144'; // Charlotte Hughes
const FATIMA = '+447700900277'; // Tom Walker
const UNKNOWN_MISSED = '+447700900911';
const UNKNOWN_ANSWERED = '+447700900922';

test.beforeAll(async () => {
  const b = agency('B');
  setActor({ email: b.email, password: b.password, tenantId: b.tenantId });
  await ensureInboundLine();
  await callingOn();
  // Tom Walker's enquiry (a new lead) is what his answered call moves to Contacted.
  const have = rows(await api('GET', `/leads?search=${encodeURIComponent('Rajasthan Palace Circuit')}`)).find((l) => /Rajasthan Palace Circuit/.test(l.title));
  if (have && have.status !== 'new') await api('PUT', `/leads/${have.id}/status`, { status: 'new' }); // a re-take starts from a new enquiry
  if (!have) {
    const tom = rows(await api('GET', '/contacts?search=Tom%20Walker')).find((c) => /Tom Walker/.test(c.name));
    if (!tom) throw new Error('Tom Walker missing: run film-prep --agencies');
    const r = await api('POST', '/leads', { contactId: tom.id, title: 'Rajasthan Palace Circuit', destinations: ['Jaipur', 'Udaipur'], budget: 5200, currency: 'GBP', paxAdults: 2, tripType: 'international', source: 'manual', priority: 'warm', travelDate: new Date(Date.now() + 80 * 86400_000).toISOString().slice(0, 10) });
    if (!r?.success) throw new Error(`lead for Tom: ${JSON.stringify(r).slice(0, 200)}`);
  }
});
test.afterAll(async () => {
  await admin('POST', `/tenants/${actorTenant()}/voip/close`, {});
});

test('film:automations-calls', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'automations-calls', testInfo, async () => {
    await page.goto('/assistant');
    await settle(page, 1500);
    const queue = page.getByTestId('assistant-queue');

    await beat(page, 'missed-known', async () => {
      await simulateCall('inbound_missed', PRIYA);
      await page.reload();
      await settle(page, 1200);
      const draft = queue.getByText(/Tell Charlotte Hughes we will ring back/).first();
      await expect(draft).toBeVisible({ timeout: 30_000 });
      await focus(page, 'sorry-draft', draft, { dwellMs: 800 });
      await visit(page, '/tasks');
      await search(page, /Search tasks/i, 'Call back Charlotte');
      await glance(page, page.locator('table tbody tr').filter({ hasText: 'Call back Charlotte Hughes' }).first(), 900);
    });

    await beat(page, 'missed-unknown', async () => {
      await simulateCall('inbound_missed', UNKNOWN_MISSED);
      await page.goto('/assistant');
      await settle(page, 1200);
      const offer = queue.getByText(new RegExp(`Create contact and lead for missed caller \\${UNKNOWN_MISSED}`)).first();
      await expect(offer).toBeVisible({ timeout: 30_000 });
      await glance(page, offer, 1000);
    });

    await beat(page, 'voicemail', async () => {
      await simulateCall('inbound_voicemail', PRIYA, { durationSeconds: 22, withRecording: true });
      await visit(page, '/tasks');
      await search(page, /Search tasks/i, 'voicemail');
      await expect(page.locator('table tbody tr').filter({ hasText: /Listen to voicemail from/ }).first()).toBeVisible({ timeout: 30_000 });
      await glance(page, page.locator('table tbody tr').filter({ hasText: /Listen to voicemail from/ }).first(), 1000);
    });

    await beat(page, 'answered', async () => {
      await simulateCall('inbound_answered', FATIMA, { durationSeconds: 140 });
      const lead = await findOne(`/leads?search=${encodeURIComponent('Rajasthan Palace Circuit')}`, (l) => /Rajasthan Palace Circuit/.test(l.title));
      await expect.poll(async () => (await findOne(`/leads?search=${encodeURIComponent('Rajasthan Palace Circuit')}`, (l) => l.id === lead.id)).status, { timeout: 25_000 }).toBe('contacted');
      await page.goto(`/leads/${lead.id}`);
      await settle(page, 1200);
      await clickOn(page, page.getByRole('tab', { name: 'Activity' }));
      const entry = page.getByText(/Inbound call, 2 min|Inbound call, 140 s|Inbound call/).first();
      await expect(entry).toBeVisible({ timeout: 15_000 });
      await focus(page, 'timeline-call', entry, { dwellMs: 700 });
      await glance(page, page.getByTestId('assistant-panel').getByText(/Schedule a follow-up with/).first(), 900);
    });

    await beat(page, 'answered-unknown', async () => {
      await simulateCall('inbound_answered', UNKNOWN_ANSWERED, { durationSeconds: 95 });
      await page.goto('/assistant');
      await settle(page, 1200);
      const offer = queue.getByText(new RegExp(`Create contact and lead for \\${UNKNOWN_ANSWERED}`)).first();
      await expect(offer).toBeVisible({ timeout: 30_000 });
      await glance(page, offer, 1000);
      await pause(page, 400);
    });
  });
});
