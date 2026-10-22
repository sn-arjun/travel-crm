import { test, expect, type Locator, type Page } from './fixtures';
import { api, seedContact, seedLead } from './helpers/api-seed';

// The Leads page as a pipeline board (R153): switch to Board, drag a card to another column, move one with "Move to…" from the
// keyboard, drop on Lost (reason asked) and on Won (confirmation asked), see a refused move put the card back, filter, load more
// in a long column, and check the list view still works. A unique stamp in the search box keeps the board to this run's leads.

const column = (page: Page, name: string): Locator =>
  page.getByTestId('lead-board').getByRole('region', { name: new RegExp(`^${name}, \\d+$`) });
const card = (col: Locator, title: string): Locator => col.locator('[data-testid="lead-card"]', { hasText: title });
const countOf = async (col: Locator): Promise<number> => Number(/, (\d+)$/.exec((await col.getAttribute('aria-label')) ?? '')?.[1]);
/**
 * Drags a card onto a column the way a hand does: press, a few small moves (the browser starts the drag after the first ones),
 * then across to the column. A single jump from press to drop lets the page scroll under the pointer before the drag starts.
 */
async function dragCard(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx + 10, fy + 5, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(120, to.height / 2), { steps: 12 });
  await page.mouse.up();
}
const statusOf = async (id: string): Promise<{ status: string; lostReason?: string | null }> => (await api('GET', `/leads/${id}`)).data;

test.describe('Leads pipeline board', () => {
  // Wide enough for all seven columns, so a drop never needs the board to scroll (that has its own test below).
  test.use({ viewport: { width: 2000, height: 1100 } });

  test('drag, Move to by keyboard, Lost reason, Won confirmation, refused move, filters, load more, list view', async ({ page }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36);
    const contact = await seedContact({ name: `Board Guest ${stamp}` });
    const titles: string[] = [];
    const ids: Record<string, string> = {};
    for (let i = 1; i <= 26; i++) {
      const title = `Board ${stamp} ${String(i).padStart(2, '0')}`;
      const lead = await seedLead(contact.id, { title, priority: i <= 2 ? 'hot' : 'warm', budget: 1000 * i });
      expect(lead.id, `lead ${i} created`).toBeTruthy();
      titles.push(title);
      ids[title] = lead.id;
    }

    await page.goto('/leads');
    await page.getByTestId('leads-view-board').click();
    await page.getByPlaceholder(/Search leads/i).fill(stamp);

    const newCol = column(page, 'New');
    await expect.poll(() => countOf(newCol), { timeout: 20_000 }).toBe(26);
    await expect(newCol.getByTestId('lead-card')).toHaveCount(20);
    // The first five cards of the column (newest first; leads made in the same second have no fixed order) are the ones moved below.
    const firstCards = await newCol.getByTestId('lead-card').evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute('aria-label') ?? ''));
    const [drag, byKey, lost, won, refused] = firstCards as [string, string, string, string, string];
    // Skeleton columns are gone, the other pipeline columns are there with their counts.
    for (const name of ['Contacted', 'Qualified', 'Proposal sent', 'Negotiation', 'Won', 'Lost']) await expect(column(page, name)).toBeVisible();
    await expect(column(page, 'On hold')).toHaveCount(0);

    // Drag a card from New to Contacted: it moves at once, and the lead's status is Contacted.
    const contacted = column(page, 'Contacted');
    await dragCard(page, card(newCol, drag), contacted);
    await expect(card(contacted, drag)).toBeVisible();
    await expect.poll(() => countOf(newCol)).toBe(25);
    await expect.poll(() => countOf(contacted)).toBe(1);
    await expect.poll(async () => (await statusOf(ids[drag]!)).status).toBe('contacted');
    // The status route ran as on the lead page: the change is in the lead's activity.
    const activities = await api('GET', `/leads/${ids[drag]}/activities`);
    expect(JSON.stringify(activities)).toContain('status_change');

    // Move another with the keyboard: focus the card's "Move to…" button, open it with Enter, arrow down from the first column (Contacted) to Qualified, Enter.
    const target = card(newCol, byKey);
    await target.getByTestId('lead-card-move').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Contacted' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Qualified' })).toBeFocused();
    await page.keyboard.press('Enter');
    const qualified = column(page, 'Qualified');
    await expect(card(qualified, byKey)).toBeVisible();
    await expect(page.getByTestId('lead-board-status')).toContainText(`${byKey} moved to Qualified`);
    await expect.poll(async () => (await statusOf(ids[byKey]!)).status).toBe('qualified');

    // Dropping on Lost asks for a reason. Cancelling moves nothing.
    const lostCol = column(page, 'Lost');
    await dragCard(page, card(newCol, lost), lostCol);
    const dialog = page.getByTestId('lost-reason-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mark as lost' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(card(newCol, lost)).toBeVisible();
    expect((await statusOf(ids[lost]!)).status).toBe('new');
    // Giving a reason moves it, and the reason is kept on the lead.
    await dragCard(page, card(newCol, lost), lostCol);
    await dialog.getByLabel('Reason for loss').fill('Chose another agency');
    await dialog.getByRole('button', { name: 'Mark as lost' }).click();
    await expect(card(lostCol, lost)).toBeVisible();
    await expect.poll(async () => statusOf(ids[lost]!)).toMatchObject({ status: 'lost', lostReason: 'Chose another agency' });

    // Dropping on Won asks for confirmation.
    const wonCol = column(page, 'Won');
    await dragCard(page, card(newCol, won), wonCol);
    const confirm = page.getByRole('dialog').filter({ hasText: 'as won' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(card(newCol, won)).toBeVisible();
    await dragCard(page, card(newCol, won), wonCol);
    await page.getByRole('dialog').filter({ hasText: 'as won' }).getByRole('button', { name: 'Mark as won' }).click();
    await expect(card(wonCol, won)).toBeVisible();
    await expect.poll(async () => (await statusOf(ids[won]!)).status).toBe('won');

    // A move the status route refuses (Proposal sent needs an itinerary) puts the card back and says why.
    const proposal = column(page, 'Proposal sent');
    await dragCard(page, card(newCol, refused), proposal);
    await expect(page.getByText(/Create an itinerary/i).first()).toBeVisible();
    await expect(card(newCol, refused)).toBeVisible();
    await expect(card(proposal, refused)).toHaveCount(0);
    expect((await statusOf(ids[refused]!)).status).toBe('new');

    // The priority filter narrows every column: the two hot leads, less any of them moved above, are what is left in New.
    const hotLeft = 2 - [drag, byKey, lost, won].filter((t) => titles.slice(0, 2).includes(t)).length;
    await page.getByRole('combobox', { name: 'Filter by priority' }).click();
    await page.getByRole('option', { name: 'Hot' }).click();
    await expect.poll(() => countOf(newCol)).toBe(hotLeft);
    await expect(column(page, 'Lost')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect.poll(() => countOf(newCol)).toBe(22);

    // A long column shows 20 and loads the rest on request.
    await expect(newCol.getByTestId('lead-card')).toHaveCount(20);
    await newCol.getByTestId('board-load-more-new').click();
    await expect(newCol.getByTestId('lead-card')).toHaveCount(22);
    await expect(newCol.getByTestId('board-load-more-new')).toHaveCount(0);

    // The choice is remembered; the list view still works and keeps the search.
    await page.reload();
    await expect(page.getByTestId('lead-board')).toBeVisible();
    await page.getByTestId('leads-view-list').click();
    await expect(page.getByTestId('lead-board')).toHaveCount(0);
    await page.getByPlaceholder(/Search leads/i).fill(stamp);
    await expect(page.getByRole('table')).toContainText(`Board ${stamp}`, { timeout: 20_000 });
  });
});

test.describe('Leads pipeline board at a narrow width', () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test('holding a card at the edge scrolls the board to the columns out of view', async ({ page }) => {
    const stamp = Date.now().toString(36);
    const contact = await seedContact({ name: `Edge Guest ${stamp}` });
    const title = `Edge ${stamp}`;
    const lead = await seedLead(contact.id, { title });
    expect(lead.id).toBeTruthy();

    await page.goto('/leads');
    await page.getByTestId('leads-view-board').click();
    await page.getByPlaceholder(/Search leads/i).fill(stamp);
    const newCol = column(page, 'New');
    await expect.poll(() => countOf(newCol), { timeout: 20_000 }).toBe(1);

    const viewport = page.locator('[data-testid="lead-board"] [data-slot="scroll-area-viewport"]');
    const scrollLeft = () => viewport.evaluate((el) => Math.abs(el.scrollLeft));
    expect(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth), 'the columns do not all fit').toBe(true);
    expect(await scrollLeft()).toBe(0);

    const from = (await card(newCol, title).boundingBox())!;
    const edge = (await viewport.boundingBox())!;
    const fx = from.x + from.width / 2;
    const fy = from.y + from.height / 2;
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.mouse.move(fx + 10, fy + 5, { steps: 3 });
    await page.mouse.move(edge.x + edge.width - 24, fy, { steps: 10 });
    // Held near the right edge, the board scrolls by itself (the page keeps sending drag events while the pointer rests),
    // until the last column (Lost) is in view.
    const lost = column(page, 'Lost');
    await expect
      .poll(
        async () => {
          await page.mouse.move(edge.x + edge.width - 24 + (Date.now() % 2), fy);
          const box = await lost.boundingBox();
          return !!box && box.x + box.width <= edge.x + edge.width + 1;
        },
        { timeout: 15_000, intervals: [80] },
      )
      .toBe(true);
    expect(await scrollLeft()).toBeGreaterThan(100);
    await page.waitForTimeout(400); // the scrolling stops a moment after the last drag event

    // Lost is the last column; once in view the card can be dropped on it, which asks for the reason.
    const lostBox = (await lost.boundingBox())!;
    await page.mouse.move(lostBox.x + lostBox.width / 2, lostBox.y + 120, { steps: 10 });
    await page.mouse.up();
    const dialog = page.getByTestId('lost-reason-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(card(newCol, title)).toHaveCount(1);
  });
});

