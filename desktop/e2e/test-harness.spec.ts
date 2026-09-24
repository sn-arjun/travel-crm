import { test, expect } from '@playwright/test';
import { resetTestData, seedContact, seedLead, api } from './helpers/api-seed';

test.describe('Test harness — /test/reset', () => {
  test('resets the tenant to a known, queryable state', async () => {
    await resetTestData();

    const contact = await seedContact();
    expect(contact.id).toBeTruthy();

    const lead = await seedLead(contact.id);
    expect(lead.id).toBeTruthy();

    const before = await api('GET', '/contacts?limit=1');
    expect(Array.isArray(before.data ?? before.data?.data)).toBeTruthy();

    await resetTestData();

    const after = await api('GET', `/contacts/${contact.id}`);
    expect(after.success).toBe(false);
  });
});
