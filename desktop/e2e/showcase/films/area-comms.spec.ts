/** Film area-comms: inbox, reply, email, bulk send, templates, channels, website chat (studio/clips/area-comms.json). Demo admin. */
import { asUser, beat, clickOn, expect, focus, glance, inbound, openRow, pause, pickSelect, recordFilm, scrollSteps, settle, typeInto, visit } from './film-kit';

const test = asUser();
const CUSTOMER = { name: 'Anjali Varma', phone: '+919847055120', email: 'anjali.varma@example.com' };

test('film:area-comms', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'area-comms', testInfo, async () => {
    await page.goto('/communication');
    await settle(page, 1500);

    await beat(page, 'inbox-arrive', async () => {
      await pause(page, 900);
      await inbound({ from: CUSTOMER.phone, fromName: CUSTOMER.name, body: 'Hello! Do you have a 4-night Coorg plan for two in the first week of January? Something quiet, with a coffee estate stay.' });
      const row = page.locator('table tbody tr').filter({ hasText: CUSTOMER.phone }).or(page.locator('table tbody tr').filter({ hasText: CUSTOMER.name })).first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await focus(page, 'new-message', row, { dwellMs: 600 });
    });

    await beat(page, 'inbox-thread', async () => {
      await clickOn(page, page.locator('table tbody tr').filter({ hasText: 'Neha Kapoor' }).first());
      await expect(page.getByRole('dialog')).toBeVisible();
      await pause(page, 1500);
      await page.keyboard.press('Escape');
      await pause(page, 300);
    });

    await beat(page, 'inbox-reply', async () => {
      await page.goto('/communication/compose');
      await settle(page, 1000);
      await glance(page, page.getByText('WhatsApp', { exact: true }).first(), 400);
      const combo = page.getByRole('combobox').first();
      if (await combo.isVisible().catch(() => false)) {
        await clickOn(page, combo);
        await typeInto(page, page.getByPlaceholder(/Search/i).last(), 'Arjun');
        await settle(page, 600);
        await clickOn(page, page.getByRole('option').filter({ hasText: 'Arjun Mehta' }).first().or(page.locator('[cmdk-item]').filter({ hasText: 'Arjun Mehta' }).first()));
      }
      await typeInto(page, page.locator('textarea').first(), 'Hi Arjun, your Kerala honeymoon vouchers are ready. Shall I send them here?', { delay: 25 });
      const preview = page.getByRole('button', { name: /^Preview$/ });
      await focus(page, 'preview', preview);
      await clickOn(page, preview);
      await pause(page, 1300);
      const send = page.getByRole('button', { name: /Send WhatsApp|^Send$/ }).last();
      await clickOn(page, send);
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /sent/i }).first()).toBeVisible({ timeout: 15_000 });
    });

    await beat(page, 'inbox-email', async () => {
      await inbound({ channel: 'email', from: CUSTOMER.email, fromName: CUSTOMER.name, to: 'enquiries@sahyadriholidays.in', body: 'Subject: Coorg in January\n\nAlso, could you include a guided coffee plantation walk? Thanks, Anjali' });
      await visit(page, '/communication');
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /All channels/ }), 'Email');
      await settle(page, 1100);
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /^Email$/ }), /All channels/);
      await page.goto('/settings/email-signature');
      await settle(page, 1200);
    });

    await beat(page, 'bulk-send', async () => {
      await page.goto('/communication/bulk-send');
      await settle(page, 1000);
      await clickOn(page, page.getByRole('button', { name: 'WhatsApp', exact: true }));
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /Choose a tag/ }), 'honeymoon');
      await settle(page, 700);
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /No template/ }), /Booking confirmed/);
      await settle(page, 900);
    });

    await beat(page, 'templates', async () => {
      await visit(page, '/communication/templates');
      await scrollSteps(page, 1, 300);
      await glance(page, page.locator('table tbody tr').first(), 700);
    });

    await beat(page, 'channels', async () => {
      await page.goto('/settings/integrations');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
      const meta = page.getByText(/Meta|WhatsApp Business/).first();
      await focus(page, 'meta-card', meta, { dwellMs: 700 });
      await scrollSteps(page, 2, 350);
    });

    await beat(page, 'chatbot', async () => {
      await visit(page, '/chatbot');
      await openRow(page, 'Meera', /\/chatbot\/conversations\/[^/]+$/);
      await typeInto(page, page.getByPlaceholder(/Type a reply/i), 'Namaste Meera, a January honeymoon in the Andamans is perfect. May I call you this evening?', { delay: 25 });
      await clickOn(page, page.getByRole('button', { name: 'Send reply' }));
      await settle(page, 900);
      await page.goto('/settings/chatbot');
      await settle(page, 1100);
      await clickOn(page, page.getByRole('tab', { name: /Install widget/i }));
      await pause(page, 1100);
    });
  });
});
