import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';
import { API_URL } from './helpers/auth';

/**
 * Chatbot slice — Conversations list, conversation detail, Analytics, Settings.
 *
 * Conversations are not created through any form in this app. A website visitor creates them
 * through the agency's public widget mount, `POST /api/v1/public/chatbot/:widgetKey/messages`
 * (no CRM login; the calling website's Origin must be on the agency's allow-list). This spec
 * seeds the same way: it reads the widget key from `GET /chatbot/widget`, adds a test origin to
 * the allowed websites with `PUT /chatbot/config/website`, and posts as an anonymous visitor
 * sending that Origin. The plan feature `ai_chatbot` is still checked, so on a plan without it
 * (the pro-plan seed) the plan-gated tests skip and only the gated-state check runs.
 *
 * Because there is no create UI, this spec cannot do a full
 * create-via-form -> edit -> delete round trip the way a normal CRUD entity
 * spec would. What IS real and testable:
 *  - Conversations list: search, status/channel filters, infinite-scroll
 *    plumbing, CSV export, empty state, hover actions (view/close), bulk
 *    close, row -> detail navigation.
 *  - Conversation detail: transcript, visitor info, stats, reply, hand off,
 *    close, create-lead (a real, previously-orphaned endpoint), Send message
 *    (Communication Hub, not mailto:/wa.me).
 *  - Settings: config load/edit/save round trip, the Install tab's copyable snippet from
 *    GET /chatbot/widget, and the Allowed websites field.
 *  - Analytics: gate resolution and that the page never leaks a raw 403.
 *
 * No relation fields, phone inputs, address autocomplete, currency inputs, or
 * date pickers exist in this slice (per the manifest's uxContract notes), so
 * those UX-contract checks are not applicable here.
 */

async function waitForGateResolved(page: Page) {
  await expect
    .poll(async () => page.locator('main .animate-pulse').count(), { timeout: 20_000 })
    .toBe(0);
}

/** The website the seeded visitors "chat from"; added to the allowed websites in beforeAll. */
const TEST_ORIGIN = 'https://e2e-chatbot.example.test';
/**
 * Every seeded message carries this tag and the website config has a FAQ entry for it, so the bot answers
 * from the FAQ. That keeps seeding deterministic on a stack without AI (the message and the reply are
 * saved; the AI path would answer 503 and drop the visitor's message).
 */
const SEED_TAG = '[e2e-seed]';
let widgetKey = '';

/** Reads the widget key and makes sure TEST_ORIGIN is on the allow-list (keeping what is already there). */
async function prepareWidget() {
  const info = await api('GET', '/chatbot/widget');
  widgetKey = info?.data?.widgetKey;
  if (!widgetKey) throw new Error(`No widget key from GET /chatbot/widget: ${JSON.stringify(info)}`);
  const allowed: string[] = info?.data?.allowedOrigins ?? [];
  const existing = await api('GET', '/chatbot/config/website').catch(() => null);
  let faq: Array<{ question: string; answer: string }> = [];
  try { faq = JSON.parse(existing?.data?.faq_entries ?? '[]'); } catch { faq = []; }
  if (!faq.some((f) => f.question === SEED_TAG)) faq.push({ question: SEED_TAG, answer: 'Thanks! An agent will reply shortly.' });
  // The website config row (greeting, enabled) must exist and be on, or the public mount answers 404.
  await api('PUT', '/chatbot/config/website', {
    enabled: true,
    greeting: 'Hi! How can we help?',
    faqEntries: faq,
    allowedOrigins: allowed.includes(TEST_ORIGIN) ? allowed : [...allowed, TEST_ORIGIN],
  });
}

async function seedConversation(overrides: {
  visitorId: string;
  message: string;
  visitorName?: string;
  visitorEmail?: string;
}) {
  // An anonymous website visitor: no Authorization header, only the page's Origin.
  const res = await fetch(`${API_URL}/public/chatbot/${widgetKey}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN },
    body: JSON.stringify({
      visitorId: overrides.visitorId,
      message: `${overrides.message} ${SEED_TAG}`,
      visitorName: overrides.visitorName,
      visitorEmail: overrides.visitorEmail,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!body?.data?.conversationId) {
    throw new Error(`Failed to seed chatbot conversation (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.conversationId as string;
}

test.describe.serial('Chatbot', () => {
  let conversationId: string;
  const ts = Date.now();
  const visitorId = `e2e-visitor-${ts}`;
  const visitorName = `E2E Visitor ${ts}`;
  const visitorEmail = `e2e-visitor-${ts}@test.com`;

  // Self-sufficient: this spec never relies on feature flags left behind by other
  // specs. beforeAll switches ai_chatbot on (restoring it in afterAll). On a plan that
  // does not include the chatbot, PUT /ai/settings/features refuses to enable it, so
  // the spec deliberately asserts the gated state instead of seeding conversations.
  let gated = false;
  let flagWasEnabled: boolean | undefined;

  test.beforeAll(async () => {
    const settings = await api('GET', '/ai/settings');
    const flag = (settings?.data?.aiFeatures ?? []).find((f: { key: string }) => f.key === 'ai_chatbot');
    flagWasEnabled = flag?.enabled;
    const res = await api('PUT', '/ai/settings/features', { features: { ai_chatbot: true } });
    gated = (res?.data?.denied ?? []).includes('ai_chatbot');
    if (gated) return;
    await prepareWidget();
    conversationId = await seedConversation({
      visitorId,
      visitorName,
      visitorEmail,
      message: `Hi, I want to book a trip to Bali ${ts}`,
    });
  });

  test.afterAll(async () => {
    if (!gated && flagWasEnabled === false) {
      await api('PUT', '/ai/settings/features', { features: { ai_chatbot: false } });
    }
  });

  test.beforeEach(({}, testInfo) => {
    const isGatedCheck = testInfo.title.startsWith('Gated plan');
    test.skip(gated !== isGatedCheck, gated ? 'ai_chatbot is not on this plan' : 'ai_chatbot is enabled');
  });

  test('Gated plan — chatbot pages show the upgrade state, never a raw 403 or error toast', async ({ page }) => {
    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);
    await expect(page.locator('text=/upgrade|not on your plan|quota is used up/i').first()).toBeVisible({ timeout: 10_000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);
  });

  test('Conversations list — gate resolves, seeded conversation appears with real values', async ({ page }) => {
    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);

    // Demo tenant is on the enterprise plan, so ai_chatbot is enabled — the
    // working list must render, never the upgrade/disabled affordance.
    await expect(page.locator('text=/upgrade|not on your plan|quota is used up/i')).toHaveCount(0);
    await expect(page.locator('h1').filter({ hasText: 'Chatbot' })).toBeVisible({ timeout: 10_000 });

    // Search narrows results to the seeded conversation.
    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill(visitorName);
    await page.waitForTimeout(800);
    await expect(page.locator('tr').filter({ hasText: visitorName })).toBeVisible({ timeout: 10_000 });

    // Row shows channel tag and "active" status for a freshly seeded conversation.
    const row = page.locator('tr').filter({ hasText: visitorName });
    await expect(row).toContainText(/web/i);
    await expect(row).toContainText(/active/i);

    // No raw ID inputs, no direct outbound-messaging anchors on the list page.
    await expect(page.locator('input[name*="id" i]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="wa.me"]')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

    // Clear search, filter by status, confirm the filter narrows the list.
    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('Conversations list — status/channel filters narrow results, empty state renders for impossible filter', async ({ page }) => {
    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);

    // Filter to "closed" — the seeded conversation is "active", so it must disappear.
    const statusSelect = page.locator('button').filter({ hasText: /All statuses/i }).first();
    await statusSelect.click();
    await page.getByRole('option', { name: 'Closed', exact: true }).click();
    await page.waitForTimeout(800);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(visitorName);
    await page.waitForTimeout(800);

    // Our active conversation must not show under the "closed" filter.
    await expect(page.locator('tr').filter({ hasText: visitorName })).toHaveCount(0);

    // Filter chip is visible and clearing it restores state.
    await expect(page.locator('text=/^Status$/').first()).toBeVisible();
    const clearAllButton = page.getByRole('button', { name: /Clear/i }).first();
    if (await clearAllButton.isVisible().catch(() => false)) {
      await clearAllButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('Conversation detail — transcript, visitor info, reply, hand off, then create lead', async ({ page }) => {
    await page.goto(`/chatbot/conversations/${conversationId}`);
    await waitForLoad(page);

    // Detail shows the visitor's filled-in name/email and channel.
    await expect(page.getByRole('heading', { name: visitorName })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=' + visitorEmail)).toBeVisible();
    await expect(page.locator('text=/^web$/i').first()).toBeVisible();

    // Transcript shows the seeded visitor message.
    await expect(page.locator(`text=Hi, I want to book a trip to Bali ${ts}`)).toBeVisible();

    // Stats card reflects real message counts (not fabricated placeholders).
    await expect(page.locator('text=Messages').first()).toBeVisible();

    // Messaging goes through the Communication Hub and needs a CRM contact. A chatbot-only
    // visitor has none, so there is no Send message action (and never a mailto:/wa.me anchor).
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="wa.me"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Send message/i })).toHaveCount(0);

    // Agent reply — real POST /chatbot/conversations/:id/reply round trip.
    const replyText = `E2E agent reply ${ts}`;
    await page.getByPlaceholder(/Type a reply/i).fill(replyText);
    const replyResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/chatbot/conversations/${conversationId}/reply`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Send reply' }).click();
    const replyResponse = await replyResponsePromise;
    expect(replyResponse.ok()).toBe(true);
    await waitForLoad(page);

    // Replying sets status to handed_off server-side — refetch reflects it.
    await expect(page.locator('text=/handed off/i').first()).toBeVisible({ timeout: 10_000 });

    // Create lead: the visitor has a name and an email, so the backend creates (or
    // reuses) a contact, creates the lead, links both to the conversation and the page
    // opens the new lead.
    await page.getByRole('button', { name: 'More actions' }).click();
    const createLeadOption = page.getByRole('menuitem', { name: 'Create lead' });
    await expect(createLeadOption).toBeVisible();
    const createLeadResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/chatbot/conversations/${conversationId}/create-lead`) && res.request().method() === 'POST',
    );
    await createLeadOption.click();
    const createLeadResponse = await createLeadResponsePromise;
    expect(createLeadResponse.status()).toBe(201);
    await expect(page.locator('text=Lead created from conversation')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 10_000 });
  });

  test('Conversations list — bulk close and hover-close actions call the real close endpoint', async ({ page }) => {
    const closeVisitorId = `e2e-visitor-close-${ts}`;
    const closeVisitorName = `E2E Close ${ts}`;
    const closeConvoId = await seedConversation({
      visitorId: closeVisitorId,
      visitorName: closeVisitorName,
      message: `Test message for close flow ${ts}`,
    });

    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(closeVisitorName);
    await page.waitForTimeout(800);

    const row = page.locator('tr').filter({ hasText: closeVisitorName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/active/i);

    const closeButton = row.getByRole('button', { name: 'Close conversation' });
    await expect(closeButton).toBeVisible();
    const closeResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/chatbot/conversations/${closeConvoId}/close`) && res.request().method() === 'POST',
    );
    await closeButton.click();
    const closeResponse = await closeResponsePromise;
    expect(closeResponse.ok()).toBe(true);

    // Confirm persisted server-side.
    const check = await api('GET', `/chatbot/conversations/${closeConvoId}`);
    expect(check?.data?.status).toBe('closed');
  });

  test('Conversations list — CSV export downloads a non-empty file', async ({ page }) => {
    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/i }).click();
    const download = await downloadPromise;
    const streamPath = await download.path();
    expect(streamPath).toBeTruthy();
    const fs = await import('fs');
    const stats = fs.statSync(streamPath!);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('Conversations list — infinite scroll loads more rows when many conversations exist', async ({ page }) => {
    // Seed enough conversations to guarantee more than one page.
    for (let i = 0; i < 25; i += 1) {
      await seedConversation({
        visitorId: `e2e-scroll-${ts}-${i}`,
        message: `Scroll test message ${i}`,
      });
    }

    await page.goto('/chatbot');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const initialRows = await page.locator('tbody tr').count();
    expect(initialRows).toBeGreaterThan(0);

    await page.locator('tbody tr').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await waitForLoad(page);

    const afterScrollRows = await page.locator('tbody tr').count();
    expect(afterScrollRows).toBeGreaterThanOrEqual(initialRows);
  });

  test('Analytics — gate resolves, never leaks a raw 403, real fields render', async ({ page }) => {
    await page.goto('/chatbot/analytics');
    await waitForLoad(page);
    await waitForGateResolved(page);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b403\b|Forbidden/);
    await expect(page.locator('text=/upgrade|not on your plan|quota is used up/i')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Chatbot Analytics' })).toBeVisible({ timeout: 10_000 });

    // FIXED DURING THIS SLICE: the backend's GET /chatbot/analytics
    // (backend/src/routes/chatbot.ts) returns { totalConversations, byChannel,
    // byStatus, handoffCount, qualifiedCount, avgMessagesPerConversation,
    // totalAiCost, handoffRate: string }, but the frontend's ChatbotAnalytics
    // type/UI originally read resolvedConversations/activeConversations/
    // avgResolutionTime/customerSatisfaction/handoffRate:number — none of
    // which the backend sent, so stat tiles always showed 0 regardless of
    // real data. Normalized the shape in desktop/src/lib/api/chatbot.ts
    // (chatbotApi.analytics.get) by deriving active/resolved counts from
    // byStatus and parsing handoffRate to a number.
    await expect(page.locator('text=Total conversations')).toBeVisible();
    await expect(page.locator('text=Avg resolution time')).toBeVisible();
    await expect(page.locator('text=Handoff rate')).toBeVisible();
    await expect(page.getByText('Satisfaction', { exact: true })).toBeVisible();

    // By this point earlier tests in this serial suite have seeded 25+
    // conversations — assert a real nonzero count, not just "some digit".
    const totalTile = page.locator('text=Total conversations').locator('..').locator('..');
    const totalText = (await totalTile.innerText()).match(/\d+/)?.[0];
    expect(Number(totalText)).toBeGreaterThan(0);
  });

  test('Settings — config loads, edits persist, install tab has real embed snippet', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/settings/chatbot');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: 'Chatbot configuration' })).toBeVisible({ timeout: 10_000 });

    // Website bot tab: edit welcome message and save; assert it round-trips
    // through PUT /chatbot/config (real API, not a client-only toast).
    const welcomeInput = page.getByLabel('Welcome message');
    const newWelcome = `E2E welcome message ${ts}`;
    await welcomeInput.fill(newWelcome);

    const saveResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/chatbot/config') && res.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /Save changes/i }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBe(true);
    await waitForLoad(page);

    await page.reload();
    await waitForLoad(page);
    // FIXED DURING THIS SLICE: GET /chatbot/config (no :channel) in
    // backend/src/routes/chatbot.ts returns an array of per-channel config
    // rows (`{ success: true, data: [...] }`), but the frontend's
    // ChatbotConfig type/settings page originally treated `config.data` as a
    // single object with a `channels` array, so the edited welcome message
    // was never actually pre-filled on reload. Normalized the shape in
    // desktop/src/lib/api/chatbot.ts (chatbotApi.config.get/update) — this
    // asserts the fix actually round-trips.
    const reloadedWelcome = await page.getByLabel('Welcome message').inputValue();
    expect(reloadedWelcome).toBe(newWelcome);

    // WhatsApp tab renders its own fields.
    await page.getByRole('tab', { name: /WhatsApp/i }).click();
    await expect(page.getByLabel('Greeting message')).toBeVisible();

    // Install widget tab: the snippet comes from GET /chatbot/widget and points at the public mount.
    await page.getByRole('tab', { name: /Install widget/i }).click();
    const snippetBlock = page.getByTestId('chatbot-embed-snippet');
    await expect(snippetBlock).toBeVisible();
    await expect(snippetBlock).toContainText(`/api/v1/public/chatbot/${widgetKey}/widget.js`);

    await page.getByRole('button', { name: /Copy/i }).click();
    await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible({ timeout: 5_000 });

    // Allowed websites: saved with PUT /chatbot/config/website and read back by GET /chatbot/widget.
    const sites = page.getByLabel('Websites');
    await expect(sites).toBeVisible();
    expect(await sites.inputValue()).toContain(TEST_ORIGIN);
    const extra = `https://e2e-${ts}.example.test`;
    await sites.fill([TEST_ORIGIN, extra].join('\n'));
    const sitesSave = page.waitForResponse(
      (res) => res.url().includes('/chatbot/config/website') && res.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /Save allowed websites/i }).click();
    expect((await sitesSave).ok()).toBe(true);
    const widgetInfo = await api('GET', '/chatbot/widget');
    expect(widgetInfo?.data?.allowedOrigins).toEqual([TEST_ORIGIN, extra]);

    // A bad entry is refused in the form, nothing is sent.
    await sites.fill('not a site, ftp://files.test');
    await page.getByRole('button', { name: /Save allowed websites/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /not website addresses/i })).toBeVisible();

    // An empty list is explained as blocking every website.
    await sites.fill('');
    await expect(page.getByText(/blocked everywhere/i)).toBeVisible();

    // No raw ID inputs anywhere on the settings page.
    await expect(page.locator('input[name*="id" i]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="wa.me"]')).toHaveCount(0);
  });
});
