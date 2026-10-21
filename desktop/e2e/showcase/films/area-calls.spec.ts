/**
 * Film area-calls: screen pop, softphone, click-to-call, log, recordings, transcripts, settings, minutes (studio/clips/area-calls.json).
 * Mock provider + call simulator only (fix-stack sets VOIP_PROVIDER=mock). The transcript is a stored sample (film-prep --transcript):
 * no AI runs. Calling is closed again after the take so later films show an agency without it.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

// Calling is not offered to Indian agencies, so this film runs on the UK film agency B (multi-agency stack, film-prep --agencies).
import { actorTenant, admin, agency, allowHttp, api, asAgency, beat, callingOn, clickOn, ensureInboundLine, expect, findOne, focus, glance, pause, recordFilm, REPO, rows, scrollSteps, setActor, settle, simulateCall, typeInto, visit, waitForSocket } from './film-kit';

const test = asAgency('B');
const PRIYA = '+447700900144'; // Charlotte Hughes
const ARVIND = '+447700900277'; // Tom Walker

test.beforeAll(async () => {
  const b = agency('B');
  setActor({ email: b.email, password: b.password, tenantId: b.tenantId });
  await ensureInboundLine();
  await callingOn();
});
test.afterAll(async () => {
  await admin('POST', `/tenants/${actorTenant()}/voip/close`, {});
});

test('film:area-calls', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  // a call without a transcript yet answers 404 on its detail page: that is the normal "no transcript" state, not a failure
  allowHttp(/\/api\/v1\/transcripts\//, [404]);
  await recordFilm(page, context, 'area-calls', testInfo, async () => {
    // the dashboard shows a red zero in the agency's currency, which the take's error-text check misreads: start on the call log
    await waitForSocket(page, '/communication/calls');
    await expect(page.getByTestId('softphone-state')).toHaveAttribute('data-softphone-state', 'ready', { timeout: 20_000 });
    let callSid = '';

    await beat(page, 'calls-pop', async () => {
      callSid = (await simulateCall('inbound_ring', PRIYA)).callSid;
      const pop = page.getByTestId('call-screen-pop');
      await expect(pop).toBeVisible({ timeout: 15_000 });
      await focus(page, 'pop', pop, { dwellMs: 900 });
      await glance(page, page.getByTestId('call-pop-lead'), 700);
    });

    await beat(page, 'calls-softphone', async () => {
      await clickOn(page, page.getByTestId('call-pop-answer'));
      const panel = page.getByTestId('call-panel');
      await expect(panel).toHaveAttribute('data-call-status', 'connected', { timeout: 10_000 });
      await focus(page, 'call-panel', panel);
      await clickOn(page, page.getByTestId('call-panel-mute'));
      await pause(page, 600);
      await clickOn(page, page.getByTestId('call-panel-mute'));
      await clickOn(page, page.getByTestId('call-panel-hold'));
      await pause(page, 700);
      await clickOn(page, page.getByTestId('call-panel-hold'));
      await typeInto(page, page.getByTestId('call-panel-note'), 'Wants the houseboat upgraded to a premium one; send the price difference in pounds.', { delay: 25 });
      // product observation: ending a simulated inbound call from the panel makes the API answer 500 ("[mock] Call not found": the
      // mock provider does not know calls the simulator opened), so the customer hangs up instead, the same call-ended update a provider sends
      await simulateCall('inbound_finish', PRIYA, { callSid, durationSeconds: 95 });
      await clickOn(page, page.getByRole('button', { name: 'Log & close' }));
      await expect(panel).toHaveCount(0);
    });

    await beat(page, 'calls-click', async () => {
      const lead = await findOne(`/leads?search=${encodeURIComponent('Kerala Spice Trail')}`, (l) => /Kerala Spice Trail/.test(l.title));
      await page.goto(`/leads/${lead.id}`);
      await settle(page, 1100);
      await clickOn(page, page.getByRole('button', { name: /^Call/ }).first());
      await page.waitForURL(/\/communication\/calls\/dial/, { timeout: 15_000 });
      await expect(page.getByTestId('softphone-status')).toContainText('Phone ready', { timeout: 20_000 });
      await clickOn(page, page.getByRole('button', { name: 'Call', exact: true }));
      const panel = page.getByTestId('call-panel');
      await expect(panel).toBeVisible({ timeout: 15_000 });
      await pause(page, 1500);
      await clickOn(page, page.getByTestId('call-panel-hangup'));
      await clickOn(page, page.getByRole('button', { name: 'Cancel' }));
    });

    await beat(page, 'calls-log', async () => {
      await visit(page, '/communication/calls');
      await scrollSteps(page, 1, 300);
      const row = page.locator('table tbody tr').first();
      await clickOn(page, row);
      await page.waitForURL(/\/communication\/calls\/[^/]+$/, { timeout: 15_000 }).catch(() => undefined);
      await settle(page, 1000);
    });

    await beat(page, 'calls-recording', async () => {
      const { callSid: rec } = await simulateCall('inbound_answered', ARVIND, { durationSeconds: 75, withRecording: true });
      let callId = '';
      await expect.poll(async () => {
        const row = rows(await api('GET', `/calls?search=${encodeURIComponent(ARVIND)}&limit=10`)).find((c) => c.providerCallId === rec);
        callId = row?.id ?? '';
        return row?.recordingState === 'stored';
      }, { timeout: 20_000 }).toBe(true);
      execFileSync(process.execPath, [path.join(REPO, 'scripts/showcase/film-prep.mjs'), '--transcript', callId, '--uk'], { stdio: 'inherit', env: process.env });
      await page.goto(`/communication/calls/${callId}`);
      await settle(page, 1200);
      const player = page.getByTestId('call-recording-player');
      await focus(page, 'player', player);
      await clickOn(page, player.getByRole('button', { name: 'Play recording' }));
      await pause(page, 1200);
      await scrollSteps(page, 2, 380);
    });

    await beat(page, 'calls-analytics', async () => {
      await page.goto('/communication/calls/analytics');
      await settle(page, 1600);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'calls-settings', async () => {
      await page.goto('/settings/voip');
      await settle(page, 1300);
      await scrollSteps(page, 2, 380);
      await page.goto('/settings/phone-numbers');
      await settle(page, 1300);
    });

    await beat(page, 'calls-minutes', async () => {
      await page.goto('/settings/billing');
      await settle(page, 1300);
      const minutes = page.getByText(/call minutes/i).first();
      await minutes.scrollIntoViewIfNeeded().catch(() => undefined);
      await glance(page, minutes, 1200);
    });
  });
});
