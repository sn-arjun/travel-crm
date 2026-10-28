import { test, expect } from './fixtures';
import { api, seedContact } from './helpers/api-seed';
import { showInPhoneFrame } from './showcase/films/film-kit';

// R164-4: the test gateway pay page (served by the API, another origin) shows inside the films' phone frame; test mode only (backend test: mock-pay-frame)
test('mock pay page in the phone frame', async ({ page }) => {
  await api('PUT', '/integrations/payment-gateways/mock', {});
  const contact = await seedContact({ name: `Frame ${Date.now()}` });
  const inv = (await api('POST', '/invoices', { contactId: contact.id, currency: 'EUR', items: [{ description: 'Tour', quantity: 1, rate: 500, taxRate: 0 }] })).data;
  const link = (await api('POST', `/invoices/${inv.id}/payment-link`, { gateway: 'mock' })).data;
  await page.goto('/dashboard');
  await showInPhoneFrame(page, link.url, { allowOrigins: [new URL(link.url).origin] });
  await expect(page.frameLocator('#phone').getByTestId('mock-amount')).toContainText('500');
});
