/**
 * VoIP settings & phone numbers — full E2E.
 *
 * Pages: /settings/voip, /settings/phone-numbers. Gate: `voip_calling`.
 * No milestone-named specs existed for this slice (calls.spec.ts covers the call pages).
 *
 * A. Gate: either the working feature or an upgrade affordance — never a 403 error toast
 * B. Settings: fill every field -> save -> reload pre-fill -> API persisted (secret masked) -> edit
 *    -> validation error -> token reveal toggle -> test connection result
 * C. Phone numbers: empty state, search dialog (request body, results, no results), purchase,
 *    set primary, delete (confirm / cancel / last-number 409), provider failure surfaces as toast
 * D. No mailto:/wa.me/tel: anchors on either page
 *
 * Provider traffic (Twilio number inventory) cannot be seeded — the backend purchases from the real
 * provider — so section C fakes ONLY `/voip/numbers*` (and the buy-ready `/voip/number-offer`) at the network layer with a
 * stateful fake that mirrors the backend contract (phoneNumber/isDefault, 409 on deleting the only number). Settings
 * (section B) hit the real backend.
 *
 * N/A for this slice (no such UI exists, see slice manifest): relation comboboxes, infinite scroll,
 * export, FilterBar/search narrowing, detail view, SendMessageDialog.
 */
import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';

test.setTimeout(120_000);

const TOAST = '[data-sonner-toast]';
const ACCOUNT_ID = `ACe2e${Date.now()}`;
const AUTH_TOKEN = 'e2eSecretToken0123456789abcdWXYZ';
const CALLER_ID = '+15550001234';

let original: Record<string, any> | null = null;

test.beforeAll(async () => {
  const res = await api('GET', '/voip/settings');
  original = res?.data ?? null;
});

test.afterAll(async () => {
  if (!original) return;
  await api('PUT', '/voip/settings', {
    voipProvider: original.voipProvider,
    providerAccountId: original.providerAccountId ?? null,
    providerAuthToken: original.providerAuthToken ? undefined : null,
    defaultCallerId: original.defaultCallerId ?? null,
    recordingPolicy: original.recordingPolicy,
    routingStrategy: original.routingStrategy,
    maxRingDuration: original.maxRingDuration,
    voicemailEnabled: original.voicemailEnabled,
    ivrEnabled: original.ivrEnabled,
    businessHoursEnabled: original.businessHoursEnabled,
  }).catch(() => undefined);
});

// ─── helpers ──────────────────────────────────────────────────────────────────

type PageState = 'enabled' | 'gated';

async function openPage(page: Page, path: string, heading: string): Promise<PageState> {
  await page.goto(path);
  await waitForLoad(page);
  const working = page.getByRole('heading', { name: heading }).first();
  const gated = page.getByText(/not available on your plan/i).first();
  await expect(working.or(gated)).toBeVisible({ timeout: 20_000 });
  const isGated = await gated.isVisible();
  if (!isGated) {
    // Page header renders in both states; the gate is only absent when real content is present.
    return 'enabled';
  }
  return 'gated';
}

async function pickOption(page: Page, trigger: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: trigger }).click();
  await page.getByRole('option', { name: option }).click();
}

async function expectNoCommAnchors(page: Page) {
  await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
}

async function expectNoErrorSurface(page: Page) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.locator(TOAST).filter({ hasText: /forbidden|403|not allowed|upgrade required/i })).toHaveCount(0);
}

// ─── fake provider-backed numbers API ─────────────────────────────────────────

interface FakeNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  isDefault: boolean;
  assignedName: string | null;
  capabilities: { voice: boolean; sms: boolean };
}

function fakeNumbersApi(page: Page, opts: { searchResults?: any[] } = {}) {
  const store: FakeNumber[] = [];
  const calls: { method: string; path: string; body: any }[] = [];
  let seq = 0;
  const ok = (route: Route, data: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  const fail = (route: Route, status: number, message: string) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, error: message, message }) });

  const ready = page.route(/\/voip\/numbers(\/[^?]*)?(\?.*)?$/, async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fallback();
    const path = new URL(req.url()).pathname.replace(/^.*\/voip\/numbers/, '') || '/';
    // The country requirements and the documents form (R137) are not part of the number list: the real backend answers them.
    if (path === '/requirements' || path === '/documents') return route.fallback();
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
    calls.push({ method, path, body });

    if (method === 'GET' && path === '/') return ok(route, store);
    if (method === 'POST' && path === '/search') return ok(route, opts.searchResults ?? []);
    if (method === 'POST' && path === '/purchase') {
      const n: FakeNumber = {
        id: `fake-${++seq}`,
        phoneNumber: body.phoneNumber,
        friendlyName: body.friendlyName ?? body.phoneNumber,
        isDefault: store.length === 0,
        assignedName: null,
        capabilities: { voice: true, sms: true },
      };
      store.push(n);
      return ok(route, { id: n.id, phoneNumber: n.phoneNumber, providerNumberId: `PN${seq}` });
    }
    const id = path.slice(1);
    const idx = store.findIndex((n) => n.id === id);
    if (idx < 0) return fail(route, 404, 'Number not found');
    if (method === 'PUT') {
      if (body.isDefault) store.forEach((n) => (n.isDefault = n.id === id));
      return ok(route, { message: 'Number updated' });
    }
    if (method === 'DELETE') {
      if (store.length <= 1) return fail(route, 409, 'Cannot delete the only phone number');
      const [removed] = store.splice(idx, 1);
      if (removed?.isDefault && store[0]) store[0].isDefault = true;
      return ok(route, { message: 'Number deleted' });
    }
    return route.fallback();
  });

  // The offer (price and documents) is faked as an agency that can buy: Buy number is off while a price or the documents are missing
  // (R141), and what the demo agency's country has in the catalogue is not what this section is about.
  const offerReady = page.route(/\/voip\/number-offer(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return ok(route, {
      calling: { allowed: true, reason: null, message: null, country: 'US', position: 'resell' },
      account: { status: 'active', provider: 'mock' },
      price: { productKey: 'phone_number_us', monthly: 2, tax: 0, total: 2, currency: 'USD', includesMarginPct: 20 },
      priceReason: null,
      kyc: { required: false, status: 'none', document: null },
      addon: { freeThisMonth: 1, productKey: 'phone_number_us' },
      numbers: [],
    });
  });

  return { store, calls, ready: Promise.all([ready, offerReady]).then(() => undefined) };
}

// ─── A. Gate ──────────────────────────────────────────────────────────────────

test.describe.serial('A. voip_calling gate', () => {
  test('both pages render the feature or an upgrade affordance, never a 403 error', async ({ page }) => {
    const voipRequests: { url: string; status: number }[] = [];
    page.on('response', (r) => {
      if (/\/voip\//.test(r.url())) voipRequests.push({ url: r.url(), status: r.status() });
    });

    for (const [path, heading, gatedCopy, featureCopy] of [
      ['/settings/voip', 'VoIP Settings', /VoIP calling is not available on your plan/i, /Provider Configuration/i],
      ['/settings/phone-numbers', 'Phone Numbers', /Phone numbers are not available on your plan/i, /Add Number|Add First Number/i],
    ] as const) {
      const state = await openPage(page, path, heading);
      if (state === 'gated') {
        await expect(page.getByText(gatedCopy)).toBeVisible();
        const upgrade = page.getByRole('link', { name: /Upgrade to enable|View plans/i });
        await expect(upgrade).toBeVisible();
        await expect(upgrade).toHaveAttribute('href', '/settings/billing');
        // A gated page must not call the endpoint and let it 403.
        expect(voipRequests.filter((r) => r.status === 403)).toEqual([]);
      } else {
        await expect(page.getByText(featureCopy).first()).toBeVisible();
      }
      await expectNoErrorSurface(page);
    }
  });
});

// ─── B. Settings ──────────────────────────────────────────────────────────────

test.describe.serial('B. VoIP settings form', () => {
  test('fill every field, save, pre-fill after reload, persisted via API with masked secret', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') {
      await expect(page.getByRole('link', { name: /Upgrade to enable|View plans/i })).toBeVisible();
      return;
    }

    // Fresh page starts with a "Not tested" badge, not a fake "Disconnected".
    await expect(page.getByText('Not tested')).toBeVisible();
    // Test Connection needs saved credentials — it is disabled until an account exists.

    await pickOption(page, 'Provider', 'Plivo');
    await page.locator('#providerAccountId').fill(ACCOUNT_ID);
    await page.locator('#providerAuthToken').fill(AUTH_TOKEN);
    await page.locator('#defaultCallerId').fill(CALLER_ID);
    await page.locator('#maxRingDuration').fill('45');
    await pickOption(page, 'Call recording', 'Inbound only');
    await pickOption(page, 'Routing strategy', 'Round robin');
    await page.getByRole('switch', { name: 'Voicemail' }).click(); // default on -> off
    await page.getByRole('switch', { name: 'IVR Menu' }).click(); // default off -> on
    await page.getByRole('switch', { name: 'Business Hours' }).click(); // default off -> on

    await page.getByRole('button', { name: /Save VoIP Settings/i }).click();
    await expect(page.locator(TOAST).filter({ hasText: 'VoIP settings saved' })).toBeVisible({ timeout: 10_000 });

    // Persisted server-side; secret is masked, never echoed.
    const saved = (await api('GET', '/voip/settings')).data;
    expect(saved.voipProvider).toBe('plivo');
    expect(saved.providerAccountId).toBe(ACCOUNT_ID);
    expect(saved.providerAuthToken).toBe(`****${AUTH_TOKEN.slice(-4)}`);
    expect(JSON.stringify(saved)).not.toContain(AUTH_TOKEN);
    expect(saved.defaultCallerId).toBe(CALLER_ID);
    expect(saved.maxRingDuration).toBe(45);
    expect(saved.recordingPolicy).toBe('inbound');
    expect(saved.routingStrategy).toBe('round_robin');
    expect(saved.voicemailEnabled).toBe(false);
    expect(saved.ivrEnabled).toBe(true);
    expect(saved.businessHoursEnabled).toBe(true);

    // Reload: every value pre-filled.
    await openPage(page, '/settings/voip', 'VoIP Settings');
    await expect(page.getByRole('combobox', { name: 'Provider' })).toContainText('Plivo');
    await expect(page.locator('#providerAccountId')).toHaveValue(ACCOUNT_ID);
    await expect(page.locator('#providerAuthToken')).toHaveValue('');
    await expect(page.locator('#providerAuthToken')).toHaveAttribute('placeholder', new RegExp(`\\*{4}${AUTH_TOKEN.slice(-4)}`));
    await expect(page.locator('#defaultCallerId')).toHaveValue(CALLER_ID);
    await expect(page.locator('#maxRingDuration')).toHaveValue('45');
    await expect(page.getByRole('combobox', { name: 'Call recording' })).toContainText('Inbound only');
    await expect(page.getByRole('combobox', { name: 'Routing strategy' })).toContainText('Round robin');
    await expect(page.getByRole('switch', { name: 'Voicemail' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'IVR Menu' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Business Hours' })).toBeChecked();
    await expectNoCommAnchors(page);
  });

  test('edit persists, and saving without retyping the token keeps the stored secret', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') return;

    await page.locator('#defaultCallerId').fill('+15559876543');
    await pickOption(page, 'Provider', 'Twilio');
    await pickOption(page, 'Call recording', 'Do not record');
    await page.getByRole('switch', { name: 'Voicemail' }).click(); // off -> on
    await page.getByRole('button', { name: /Save VoIP Settings/i }).click();
    await expect(page.locator(TOAST).filter({ hasText: 'VoIP settings saved' })).toBeVisible({ timeout: 10_000 });

    const saved = (await api('GET', '/voip/settings')).data;
    expect(saved.defaultCallerId).toBe('+15559876543');
    expect(saved.voipProvider).toBe('twilio');
    expect(saved.recordingPolicy).toBe('none');
    expect(saved.voicemailEnabled).toBe(true);
    // Token was not clobbered by the masked placeholder.
    expect(saved.providerAuthToken).toBe(`****${AUTH_TOKEN.slice(-4)}`);
  });

  test('invalid caller ID is rejected with an error toast and not persisted', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') return;
    const before = (await api('GET', '/voip/settings')).data.defaultCallerId;

    await page.locator('#defaultCallerId').fill('not-a-phone');
    await page.getByRole('button', { name: /Save VoIP Settings/i }).click();
    await expect(page.locator(TOAST).filter({ hasText: /fail|invalid|error|validation/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(TOAST).filter({ hasText: 'VoIP settings saved' })).toHaveCount(0);

    expect((await api('GET', '/voip/settings')).data.defaultCallerId).toBe(before);
  });

  test('auth token field can be revealed and hidden', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') return;
    const token = page.locator('#providerAuthToken');
    await token.fill('typed-secret');
    await expect(token).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show auth token' }).click();
    await expect(token).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide auth token' }).click();
    await expect(token).toHaveAttribute('type', 'password');
  });

  test('test connection reports a result for the saved (fake) credentials', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') return;
    await expect(page.getByText('Not tested')).toBeVisible();

    const reqPromise = page.waitForRequest((r) => /\/voip\/test-connection/.test(r.url()));
    await page.getByRole('button', { name: /Test Connection/i }).click();
    // Contract: backend route is GET, not POST.
    expect((await reqPromise).method()).toBe('GET');

    const result = page.getByTestId('voip-test-result');
    await expect(result).toBeVisible({ timeout: 45_000 });
    await expect(result).not.toBeEmpty();
    // Fake credentials can never connect: the badge must say so rather than stay "Not tested".
    await expect(page.getByText('Disconnected')).toBeVisible();
    await expect(page.getByText('Not tested')).toHaveCount(0);
  });

  test('test connection is disabled when no account is saved', async ({ page }) => {
    if ((await openPage(page, '/settings/voip', 'VoIP Settings')) === 'gated') return;
    await page.locator('#providerAccountId').fill('');
    await page.getByRole('button', { name: /Save VoIP Settings/i }).click();
    await expect(page.locator(TOAST).filter({ hasText: 'VoIP settings saved' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Test Connection/i })).toBeDisabled();
    expect((await api('GET', '/voip/settings')).data.providerAccountId).toBeNull();
  });
});

// ─── C. Phone numbers ─────────────────────────────────────────────────────────

test.describe.serial('C. Phone numbers', () => {
  const AVAILABLE = [
    { phoneNumber: '+14155550101', friendlyName: '(415) 555-0101', region: 'CA', capabilities: { voice: true, sms: true } },
    { phoneNumber: '+14155550102', friendlyName: '(415) 555-0102', region: 'CA', capabilities: { voice: true, sms: false } },
  ];

  test('empty state, search -> purchase, set primary, delete', async ({ page }) => {
    const fake = fakeNumbersApi(page, { searchResults: AVAILABLE });
    await fake.ready;
    if ((await openPage(page, '/settings/phone-numbers', 'Phone Numbers')) === 'gated') {
      await expect(page.getByRole('link', { name: /Upgrade to enable|View plans/i })).toBeVisible();
      return;
    }

    // Empty state renders with its CTA.
    await expect(page.getByText('No phone numbers configured')).toBeVisible();
    await expect(page.getByText(/Search for an available number/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add First Number/i })).toBeVisible();

    // Search dialog: cancel closes without calling the provider.
    await page.getByRole('button', { name: /^Add Number$/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add Phone Number')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(fake.calls.filter((c) => c.path === '/search')).toHaveLength(0);

    // Search with every filter filled -> request carries them -> results listed.
    await page.getByRole('button', { name: /^Add Number$/ }).click();
    await dialog.locator('#areaCode').fill('415');
    await dialog.locator('#contains').fill('555');
    await dialog.getByRole('button', { name: /Search/ }).click();
    await expect(dialog.getByText('+14155550101')).toBeVisible();
    await expect(dialog.getByText('+14155550102')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Buy number' })).toHaveCount(2);
    const search = fake.calls.find((c) => c.path === '/search')!;
    expect(search.body).toMatchObject({ areaCode: '415', contains: '555' });

    // Purchase the first -> toast, dialog closes, listed as Primary (first number auto-default).
    await dialog.getByRole('button', { name: 'Buy number' }).first().click();
    await expect(page.locator(TOAST).filter({ hasText: 'Phone number purchased' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toBeHidden();
    expect(fake.calls.find((c) => c.path === '/purchase')!.body).toMatchObject({ phoneNumber: '+14155550101' });
    const row1 = page.getByRole('row').filter({ hasText: '+14155550101' });
    await expect(row1).toBeVisible();
    await expect(row1.getByText('Primary')).toBeVisible();
    await expect(page.getByText('No phone numbers configured')).toHaveCount(0);

    // Purchase a second one.
    await page.getByRole('button', { name: /^Add Number$/ }).click();
    await dialog.locator('#areaCode').fill('415');
    await dialog.getByRole('button', { name: /Search/ }).click();
    await dialog.getByRole('button', { name: 'Buy number' }).nth(1).click();
    await expect(dialog).toBeHidden();
    const row2 = page.getByRole('row').filter({ hasText: '+14155550102' });
    await expect(row2).toBeVisible();
    await expect(row2.getByText('Primary')).toHaveCount(0);

    // Set primary on the second -> badge moves; request carries isDefault.
    await row2.hover();
    await row2.getByRole('button', { name: 'Set as primary' }).click();
    await expect(page.locator(TOAST).filter({ hasText: 'Primary number updated' })).toBeVisible({ timeout: 10_000 });
    expect(fake.calls.find((c) => c.method === 'PUT')!.body).toEqual({ isDefault: true });
    await expect(row2.getByText('Primary')).toBeVisible();
    await expect(row1.getByText('Primary')).toHaveCount(0);

    // Delete: cancel keeps the row.
    await row1.hover();
    await row1.getByRole('button', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'Remove phone number' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/This will release \+14155550101/)).toBeVisible();
    await confirm.getByRole('button', { name: /Cancel/i }).click();
    await expect(row1).toBeVisible();

    // Delete: confirm removes it.
    await row1.hover();
    await row1.getByRole('button', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator(TOAST).filter({ hasText: 'Phone number removed' })).toBeVisible({ timeout: 10_000 });
    await expect(row1).toHaveCount(0);
    expect(fake.calls.some((c) => c.method === 'DELETE')).toBe(true);

    // Backend refuses to delete the only number -> error toast, row stays.
    await row2.hover();
    await row2.getByRole('button', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator(TOAST).filter({ hasText: /only phone number|Failed to remove/i })).toBeVisible({ timeout: 10_000 });
    await expect(row2).toBeVisible();

    await expectNoCommAnchors(page);
  });

  test('search with no inventory shows the no-results message', async ({ page }) => {
    const fake = fakeNumbersApi(page, { searchResults: [] });
    await fake.ready;
    if ((await openPage(page, '/settings/phone-numbers', 'Phone Numbers')) === 'gated') return;
    await page.getByRole('button', { name: /^Add Number$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#areaCode').fill('000');
    await dialog.getByRole('button', { name: /Search/ }).click();
    await expect(dialog.getByText(/No available numbers found/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Buy number' })).toHaveCount(0);
  });

  test('provider failure during search surfaces as a toast, not a crash (real backend)', async ({ page }) => {
    if ((await openPage(page, '/settings/phone-numbers', 'Phone Numbers')) === 'gated') return;
    // Clear the credentials saved by earlier tests: in test mode with no credentials the backend uses the
    // mock provider (R301), never real Twilio. Area code 999 makes the mock's number search fail
    // deterministically (MOCK_FAILING_AREA_CODE), exercising the provider-error path.
    await api('PUT', '/voip/settings', { providerAccountId: null, providerAuthToken: null });
    await page.reload();
    await waitForLoad(page);
    await page.getByRole('button', { name: /^Add Number$|Add First Number/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#areaCode').fill('999');
    await dialog.getByRole('button', { name: /Search/ }).click();
    await expect(page.locator(TOAST).filter({ hasText: /credentials|configured|unavailable|Failed to search|search numbers/i }).first())
      .toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('button', { name: 'Buy number' })).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  test('real list endpoint returns an array matching what the page counts', async ({ page }) => {
    const res = await api('GET', '/voip/numbers');
    expect(Array.isArray(res.data)).toBe(true);
    if ((await openPage(page, '/settings/phone-numbers', 'Phone Numbers')) === 'gated') return;
    for (const n of res.data as { phoneNumber: string }[]) {
      await expect(page.getByText(n.phoneNumber).first()).toBeVisible();
    }
    if (res.data.length === 0) await expect(page.getByText('No phone numbers configured')).toBeVisible();
    await expectNoCommAnchors(page);
  });
});
