/**
 * Film area-calls: screen pop, softphone, click-to-call, log, recordings, transcripts, settings, minutes (studio/clips/area-calls.json).
 * Mock provider + call simulator only (fix-stack sets VOIP_PROVIDER=mock). The transcript is a stored sample (film-prep --transcript):
 * no AI runs. Calling is closed again after the take so later films show an agency without it.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import * as D from '../demo-data';
import { admin, api, asUser, beat, callingOn, clickOn, ensureInboundLine, expect, findOne, focus, glance, pause, recordFilm, REPO, rows, scrollSteps, settle, simulateCall, typeInto, visit, waitForSocket } from './film-kit';

const test = asUser();
const PRIYA = D.CONTACTS.find((c) => c.key === 'C01')!.phone;
const NEHA = D.CONTACTS.find((c) => c.key === 'C05')!;
const ARVIND = D.CONTACTS.find((c) => c.key === 'C24')!.phone;

test.beforeAll(async () => {
  await ensureInboundLine();
  await callingOn();
});
test.afterAll(async () => {
  await admin('POST', `/tenants/${D.TENANT_ID}/voip/close`, {});
});

test('film:area-calls', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-calls', testInfo, async () => {
    await waitForSocket(page, '/dashboard');
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
      await typeInto(page, page.getByTestId('call-panel-note'), 'Wants the houseboat upgraded to a premium one; send the price difference.', { delay: 25 });
      await clickOn(page, page.getByTestId('call-panel-hangup'));
      await clickOn(page, page.getByRole('button', { name: 'Log & close' }));
      await expect(panel).toHaveCount(0);
      await simulateCall('inbound_finish', PRIYA, { callSid, durationSeconds: 95 });
    });

    await beat(page, 'calls-click', async () => {
      const lead = await findOne(`/leads?search=${encodeURIComponent('Maldives Overwater')}`, (l) => /Maldives Overwater/.test(l.title));
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
      void NEHA;
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
      execFileSync(process.execPath, [path.join(REPO, 'scripts/showcase/film-prep.mjs'), '--transcript', callId], { stdio: 'inherit', env: process.env });
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
