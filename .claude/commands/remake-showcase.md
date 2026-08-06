# Phase 5: SHOWCASE — the single-take feature walkthrough video

This is the deliverable the whole pipeline exists to produce: **one continuous recording of every feature working**.

## Read first

1. Every `desktop/audit/remake/slices/*.json` — but **only** the `title`, `showcaseOrder`, `showcaseScript`, `pages`, and `gates` fields. Do not read the endpoint lists.
2. `desktop/e2e/showcase/showcase-helpers.ts` — the presentation helpers. Already written; use them, do not rewrite them.
3. `desktop/audit/remake/CONTRACT.md` — for selector conventions.

## Already scaffolded — do not modify

- `desktop/playwright.showcase.config.ts` — 1920×1080, `video: 'on'`, `slowMo: 250`, one worker, one retry, 60-minute timeout, servers reused.
- `desktop/e2e/showcase/showcase-helpers.ts` — `chapter`, `caption`, `highlight`, `section`, `settle`, `typeSlowly`, `scrollThrough`, `startRecording`, `getFailures`, `getChapters`.
- `desktop/e2e/showcase/finalize.ts` — the teardown that lifts the video to `desktop/showcase/full-walkthrough.webm` and writes `SHOWCASE.md`.

## Your deliverable

**`desktop/e2e/showcase/full-walkthrough.spec.ts`** — exactly one spec, one `test()`, one browser context, so the output is one unbroken take.

### Structure

```ts
test('TravelCRM Pro — complete feature walkthrough', async ({ page }) => {
  startRecording();

  await chapter(page, 'TravelCRM Pro', 'Multi-tenant CRM for tours & travels');

  await section(page, 'Leads', async () => {
    await chapter(page, 'Leads', 'Capture, qualify, convert');
    await navigateTo(page, '/leads');
    await settle(page);
    await caption(page, 'Every list filters, searches, and scrolls infinitely');
    // ...drive the real UI...
  });

  // ...one section() per slice, in showcaseOrder...

  // Assert AFTER the tour, so the recording always completes first.
  const failed = getFailures();
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS, 'chapters.json'), JSON.stringify(getChapters()));
  expect(failed, `Sections failed: ${failed.map(f => f.section).join(', ')}`).toEqual([]);
});
```

Two rules that make this survivable, and they are not optional:

1. **Every feature area is wrapped in `section()`.** It catches, captions the failure on screen, returns to `/dashboard`, and continues. One broken feature must never cost the whole recording.
2. **All assertions happen at the very end**, after the tour. The video is finalized when the context closes; asserting mid-tour truncates the deliverable.

You must write `getChapters()` to `showcase/.artifacts/chapters.json` before the final assertion — `finalize.ts` reads it to build the chapter index.

### Order

Follow `showcaseOrder` from the manifests: login and shell first, dashboard second, core CRM (contacts → leads → itineraries → invoices/payments) next, then operations (suppliers, vouchers, travellers/visa, fleet, tasks), then communication, marketing and AI, then reports, import/export, and finally settings and admin.

### What each section must show

Drive the **real UI** — click, type, submit. Never `page.goto()` straight to a deep link to skip work, and never seed via the API where the point is to show the form.

Per feature, in about 40–90 seconds:
- Navigate from the sidebar so the viewer sees where they are.
- Show the list: filter or search, and scroll enough that infinite loading is visible.
- Create a record through the form — use `typeSlowly` for the first couple of fields, and `highlight` the relation combobox so it is obvious it is a searchable picker and not an ID box.
- Open the detail view and show the data round-tripped.
- Show one thing that is distinctive about that feature (convert a lead, add a line item to an invoice, assign a driver, preview a campaign, run an AI action, download an export).

Use `caption()` to narrate. Write captions as **product copy for a viewer**, not as test steps: "Relation fields are searchable — no IDs to memorize" beats "click combobox".

### Gated features

If a slice has `gates` and the plan flag is off for the demo tenant, the section should show the **upgrade/disabled state deliberately** and caption it as such ("AI Co-Pilot — available on the Professional plan"). That is a correct, presentable outcome, not a failure. Do not let it throw.

### Data

The tenant may already hold data from the verify phase. Prefer creating fresh records with recognizable names (`Showcase Traveller`, `Showcase Invoice`) so the video reads cleanly. Only call `POST /api/v1/test/reset` at the very start if you need a clean slate — and if you do, re-seed enough data that lists are not empty on camera. **Empty tables make a bad demo.**

## Run it

```bash
cd desktop && npx playwright test --config=playwright.showcase.config.ts
```

Iterate until the run is green and `desktop/showcase/full-walkthrough.webm` exists and is more than ~20 MB (a tiny file means the take aborted early).

Watch for: sections that fail, captions overlapping modals, pages recorded mid-skeleton, and any section shorter than ~20 seconds (too fast to follow).

## Finish

Report: total runtime, video size, the chapter list, and every section that failed with the reason. Do **not** delete a failing section to make the run green — a section that fails is telling you a feature is broken, and that belongs in the report.
