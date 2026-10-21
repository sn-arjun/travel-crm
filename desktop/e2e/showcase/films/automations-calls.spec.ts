/**
 * Film automations-calls: what the assistant does after a call (studio/clips/automations-calls.json, docs/CALL-AUTOMATION.md).
 * Calls are played by the call simulator (POST /test/voip/simulate) on the mock provider: no telephony account is contacted.
 */
import * as D from '../demo-data';
import { asUser, beat, clickOn, ensureInboundLine, expect, findOne, focus, glance, pause, recordFilm, search, settle, simulateCall, visit } from './film-kit';

const test = asUser();
const contactPhone = (key: string) => D.CONTACTS.find((c) => c.key === key)!.phone;
const PRIYA = contactPhone('C01');
const FATIMA = contactPhone('C11');
const UNKNOWN_MISSED = '+919900112233';
const UNKNOWN_ANSWERED = '+919900445566';

test.beforeAll(async () => {
  await ensureInboundLine();
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
      const draft = queue.getByText(/Tell Priya Nair we will ring back/).first();
      await expect(draft).toBeVisible({ timeout: 30_000 });
      await focus(page, 'sorry-draft', draft, { dwellMs: 800 });
      await visit(page, '/tasks');
      await search(page, /Search tasks/i, 'Call back Priya');
      await glance(page, page.locator('table tbody tr').filter({ hasText: 'Call back Priya Nair' }).first(), 900);
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
      const lead = await findOne(`/leads?search=${encodeURIComponent('Kashmir Paradise')}`, (l) => /Kashmir Paradise/.test(l.title));
      await expect.poll(async () => (await findOne(`/leads?search=${encodeURIComponent('Kashmir Paradise')}`, (l) => l.id === lead.id)).status, { timeout: 25_000 }).toBe('contacted');
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
