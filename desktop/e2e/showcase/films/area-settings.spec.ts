/**
 * Film area-settings: settings, team, two-factor, sessions, privacy, apps, sign-in (studio/clips/area-settings.json). Demo admin.
 * Two-factor is switched on for the demo admin on camera and switched off again off camera (afterAll), so later takes still sign in.
 * Run it LAST in the single-stack group: it ends signed out.
 */
import { createHmac } from 'node:crypto';

import { DEMO_EMAIL, DEMO_PASSWORD } from '../demo-data';
import { api, asUser, BASE_URL, beat, clickOn, expect, findOne, focus, glance, outbox, pause, recordFilm, scrollSteps, settle, showMail, tokenFor, typeInto, visit } from './film-kit';

const test = asUser();
const INVITEE = { name: 'Meera Pillai', email: 'meera.pillai@example.com' };
const ERASE = { name: 'Karthik Menon', phone: '+919845300112', email: 'karthik.menon@example.com' };
let secret = '';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(s: string): string {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const ch of s.toUpperCase().replace(/=+$/, '')) { value = (value << 5) | BASE32.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0); msg.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = mac[mac.length - 1]! & 0x0f;
  return String((((mac[o]! & 0x7f) << 24) | (mac[o + 1]! << 16) | (mac[o + 2]! << 8) | mac[o + 3]!) % 1_000_000).padStart(6, '0');
}

test.beforeAll(async () => {
  await tokenFor(); // cached before two-factor is on, for the off-camera clean-up
  await api('POST', '/contacts', { name: ERASE.name, phone: ERASE.phone, email: ERASE.email, city: 'Kochi', country: 'India', source: 'walkin', type: 'customer' });
});
test.afterAll(async () => {
  if (secret) await api('POST', '/auth/2fa/disable', { password: DEMO_PASSWORD, code: totp(secret) });
});

test('film:area-settings', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-settings', testInfo, async () => {
    await page.goto('/settings');
    await settle(page, 1500);

    await beat(page, 'settings-hub', async () => {
      await scrollSteps(page, 2, 380);
      await page.mouse.wheel(0, -1500);
      await pause(page, 300);
    });

    await beat(page, 'company', async () => {
      await page.goto('/settings/company');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'profile', async () => {
      await page.goto('/settings/profile');
      await settle(page, 1200);
      await page.goto('/change-password');
      await settle(page, 1100);
      await typeInto(page, page.locator('#newPassword'), 'short1');
      await glance(page, page.getByText(/at least 12/i), 900);
      await typeInto(page, page.locator('#newPassword'), '');
    });

    await beat(page, 'team', async () => {
      await page.goto('/settings/team');
      await settle(page, 1300);
      const invite = page.getByRole('button', { name: 'Invite user' }).first();
      await focus(page, 'invite', invite);
      await clickOn(page, invite);
      const inv = page.getByRole('dialog');
      await typeInto(page, inv.locator('#invite-name'), INVITEE.name);
      await typeInto(page, inv.locator('#invite-email'), INVITEE.email);
      await clickOn(page, inv.locator('#invite-role'));
      await pause(page, 900);
      await clickOn(page, page.getByRole('option', { name: 'Operations' }));
      await typeInto(page, inv.locator('#invite-department'), 'Kochi desk');
      await clickOn(page, inv.getByRole('button', { name: 'Send invitation' }));
      await settle(page, 1200);
    });

    await beat(page, 'invite-mail', async () => {
      const mail = (await outbox(INVITEE.email)).find((m) => m.template === 'invite_user');
      if (!mail) throw new Error('the invitation email is not in the local outbox');
      await showMail(page, mail, 'Sahyadri Holidays via TravelCRM Pro');
      await pause(page, 2200);
    });

    await beat(page, 'two-factor', async () => {
      await page.goto(`${BASE_URL}/settings/security`);
      await settle(page, 1200);
      await clickOn(page, page.getByTestId('two-factor-start'));
      await typeInto(page, page.locator('#two-factor-password'), DEMO_PASSWORD);
      await clickOn(page, page.getByRole('button', { name: 'Continue' }));
      const qr = page.getByTestId('qr-code');
      await focus(page, 'qr', qr, { dwellMs: 900 });
      secret = ((await page.getByTestId('two-factor-secret').textContent()) ?? '').trim();
      await typeInto(page, page.locator('#two-factor-code'), totp(secret));
      await clickOn(page, page.getByTestId('two-factor-confirm'));
      await expect(page.getByTestId('two-factor-recovery-codes')).toBeVisible();
      await pause(page, 900);
      await clickOn(page, page.getByTestId('two-factor-saved'));
      await clickOn(page, page.getByTestId('two-factor-done'));
      await settle(page, 700);
    });

    await beat(page, 'security', async () => {
      await glance(page, page.getByText(/Require two-factor/i).first(), 1000);
      await page.goto('/settings/sessions');
      await settle(page, 1200);
      await page.goto('/settings/login-history');
      await settle(page, 1200);
    });

    await beat(page, 'activity-log', async () => {
      await page.goto('/settings/activity-log');
      await settle(page, 1500);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'notif-prefs', async () => {
      await page.goto('/settings/notifications');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'privacy', async () => {
      const c = await findOne(`/contacts?search=${encodeURIComponent(ERASE.name)}`, (x) => x.name === ERASE.name);
      await page.goto(`/contacts/${c.id}`);
      await settle(page, 1200);
      const card = page.getByTestId('contact-privacy');
      await card.scrollIntoViewIfNeeded();
      const dl = page.waitForEvent('download', { timeout: 30_000 });
      await clickOn(page, page.getByTestId('privacy-export'));
      await dl;
      const toggle = page.getByTestId('privacy-erase-toggle');
      await focus(page, 'erase', toggle);
      await clickOn(page, toggle);
      const form = page.getByTestId('privacy-erase-form');
      await typeInto(page, form.locator('#erase-phrase'), 'ERASE CONTACT');
      await clickOn(page, page.getByTestId('privacy-erase-confirm'));
      await settle(page, 1200);
    });

    await beat(page, 'apps', async () => {
      await page.goto('/download');
      await settle(page, 1300);
      await page.goto('/quick-start');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'sign-in', async () => {
      // off camera: two-factor off again before signing out (the cached token was minted before it was on)
      if (secret) { const r = await api('POST', '/auth/2fa/disable', { password: DEMO_PASSWORD, code: totp(secret) }); if (r.status < 300) secret = ''; }
      await page.goto('/dashboard');
      await settle(page, 800);
      await clickOn(page, page.getByTestId('sidebar-user-menu'));
      await clickOn(page, page.getByRole('menuitem', { name: /Sign out|Log out/ }));
      await page.waitForURL('**/login', { timeout: 15_000 });
      await settle(page, 900);
      // email first, then the password step, which carries the code-by-text option and the reset link
      await typeInto(page, page.locator('#email'), DEMO_EMAIL);
      await clickOn(page, page.locator('button[type="submit"]'));
      await page.waitForSelector('#password', { timeout: 15_000 });
      await settle(page, 700);
      await clickOn(page, page.getByRole('button', { name: /Forgot/i }).or(page.getByRole('link', { name: /Forgot/i })).first());
      await page.waitForURL('**/forgot-password', { timeout: 15_000 });
      await settle(page, 900);
    });
  });
});

void visit;
