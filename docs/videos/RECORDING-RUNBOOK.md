# Recording runbook: the video catalogue

For the agent or person who records and renders the films in [CATALOGUE.md](CATALOGUE.md). Every command below is local. None of them touches the Cloudflare account or a provider, and none of them spends AI except phase 6, which is gated. Run commands from the repo root in Git Bash unless a step says otherwise.

## 0. Rules

- **One stack at a time.** Do not record while a full e2e run, another stack or a Remotion render is using the machine. Check with `node desktop/scripts/fix-stack.mjs status --slot N` for each slot, and stop anything else first.
- **Use slot 2 throughout.** The API is http://localhost:8807, the web app http://localhost:3120 and the console http://localhost:3125.
- **Do one thing at a time.** Render one film at a time. Do not record while rendering. Do not run TTS while recording.
- **Never pass `--ai` to fix-stack, and never set `SHOWCASE_AI=1`.** Phase 6 is the only exception, and only with the owner's yes.
- **Retake rule:**
  - Each film gets **at most 2 retakes**, which makes 3 takes in all. `record-films.mjs` enforces this.
  - Minor cosmetic flaws are written into the report and do not trigger a retake. Examples: a slightly late hover, a toast still fading, a bright frame flagged by the white-flash check.
  - Retake only when something is wrong on screen: an error, wrong data, a step missing, or a scene shorter than its narration so that the video slows down visibly.
- **Specs need fixing before the real takes.** The specs were written against the code but have never been run. Expect to fix selectors during the dry runs in phases 2 and 3. Fix them in `desktop/e2e/showcase/films/*.spec.ts`, keeping every `beat(page, '<step>')` id unchanged. `node docs/videos/coverage.mjs` checks that every clip step is still played.
- **Where things go:**
  - Raw takes: `desktop/showcase/.work/<film>.webm`, with `marks-<film>.json` and `violations-<film>.json` beside them. The folder is gitignored.
  - Renders: `studio/out/<film>.mp4`, with `.srt`, `.chapters.txt`, `.chapters.json` and `.timeline.json` beside them.
  - Shorts: `studio/out/shorts/<film>/`.
  - Master cut: `studio/out/master.*`.
  - `studio/out` is gitignored. Nothing in this runbook creates tracked files except edits you make to specs or clips.

## 1. Before any stack: checks and narration (no stack needed)

```bash
node docs/videos/coverage.mjs                      # must print OK
cd studio
for f in $(node -e "console.log(require('../docs/videos/films.json').films.filter(f=>f.stack!=='cut').map(f=>f.id).join(' '))"); do
  node src/build.mjs $f --no-render                # Kokoro TTS -> out/narration/<film>/narration.json (cached)
done
node src/build.mjs hero --no-render
cd ..
```

This takes about 35 to 45 minutes of CPU the first time, and seconds after that. The takes are paced from these manifests. Without a manifest, a take falls back to a word-count estimate and prints a warning. Before any recording exists, `--no-render` warns about missing marks. That is expected.

## 2. Single-agency stack (19 films)

```bash
cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db && cd ..       # about 10 min with the build
E2E_API_URL=http://localhost:8807/api/v1 node --no-warnings backend/scripts/seed-demo.mjs
E2E_API_URL=http://localhost:8807/api/v1 node scripts/showcase/film-prep.mjs --demo
```

`film-prep --demo` does three things:

- sets the staff passwords to `Admin@123`, so the role films can sign in as Rahul, Sneha, Deepa and Vikram;
- adds the view-only teammate Leela Fernandes;
- moves the demo agency to Enterprise through the super admin API.

**Dry run** (fast, nothing kept), to fix selectors. Do this after any change to the app or a spec:

```bash
node scripts/showcase/record-films.mjs --slot 2 --group single --pace 0.3 --retakes 0
```

One film by hand, with the narration burned in as a caption for review:

```bash
cd desktop && E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 SHOWCASE_PACE=0.3 FILM_BURN_CAPTIONS=1 \
  npx playwright test --config=e2e/showcase/films/playwright.films.config.ts --grep "film:area-leads"
```

Dry runs create records. **Reseed before the real takes** (seed-demo, then film-prep --demo, as above).

**Real takes**, in catalogue order (`docs/videos/films.json`):

```bash
node scripts/showcase/record-films.mjs --slot 2 --group single
```

- The order is the six role films, then leads, contacts, itineraries, bookings, finance, comms, marketing, automations, automations-calls, calls, fleet, reports, and settings last.
- `area-settings` must be last. It turns two-factor on and off for the demo admin, then signs out.
- `area-calls` turns calling on before its take and closes it afterwards.
- Every film depends only on the seed, never on another film. A failed take is therefore reseeded and retaken alone, which `record-films.mjs` does automatically.
- To redo selected films: `--films area-finance,area-fleet`.

Expected time: about 60 to 75 minutes for the 19 takes, plus any retakes.

**Each take is gated** by `record-films.mjs` through `desktop/e2e/showcase/finalize.ts`. The gate requires:

- no console errors, no HTTP errors (except refusals a film declares with `allowHttp`), and no banned text;
- a length between 0.6 and 2 times the narration.

Then check the steps resolve: `cd studio && node src/build.mjs <film> --resolve`. Every screen scene must print an in and out time.

### 2b. Driver app (same single stack, Android emulator)

This needs a prerequisite outside this step's write area. `packages/driver_app/integration_test/demo_flow_test.dart` must call `await chooseAgency(tester);` (from `integration_test/helpers/agency_login.dart`, agency code `demo`) after `app.main()` and before it waits for `phone-field`.

Once that is done, run from PowerShell 7 (the script calls Flutter through the x86 PowerShell itself):

```powershell
node --no-warnings backend/scripts/seed-demo.mjs --live-trip      # with E2E_API_URL=http://localhost:8807/api/v1 set
pwsh -NoProfile -File scripts/record-driver.ps1 -Slot 2 -Out desktop/showcase/.work/driver.mp4
```

The run boots the AVD `Resizable_Experimental` if it is not running. The first run compiles the app, which can take up to 10 minutes. The whole flow must finish within 170 seconds; if it runs over, use `-Pace 80`.

Gate the take:

```bash
node --no-warnings desktop/e2e/showcase/finalize.ts --name driver --video desktop/showcase/.work/driver.mp4 --duration 40-170
```

Fallback if the emulator or the test fix is not available: the `driver` clip already resolves against the 2026-10-04 recording in `.work/driver.mp4` (`node studio/src/build.mjs driver --resolve`). That recording shows the older app without the agency-code screen. Say so in the report.

Then stop the stack: `cd desktop && node scripts/fix-stack.mjs down --slot 2`.

## 3. Multi-agency stack (4 films)

```bash
cd desktop && FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG node scripts/fix-stack.mjs up --slot 2 --reset-db --multi --pool 8 && cd ..
node scripts/showcase/console-up.mjs up --slot 2                  # builds and serves super-admin on :3125
E2E_API_URL=http://localhost:8807/api/v1 node scripts/showcase/film-prep.mjs --operator
```

- `FIX_STACK_CALLING_COUNTRIES` makes calling follow the real country rule. India and the UAE get no calling; the UK does.
- `film-prep --operator` adds the console operator Asha Rao. The film signs in through the console's login page.

Record in this order. The platform film creates agency A (Skyline Holidays) on camera. `--agencies` then creates B (Thames & Tide Travel, UK, Pro) and C (Desert Pearl Tours, UAE, Enterprise), with a few records each.

```bash
node scripts/showcase/record-films.mjs --slot 2 --films platform-owner
E2E_API_URL=http://localhost:8807/api/v1 node scripts/showcase/film-prep.mjs --agencies      # add --with-a if the platform film was skipped
node scripts/showcase/record-films.mjs --slot 2 --films plans,international,website
```

Agencies cannot be deleted, so a retake of `platform-owner` on the same stack needs a fresh agency code. Set `FILM_TAKE=2` for the retake, which uses `skyline-holidays-2`. The alternative is resetting the multi stack and running from the top of this section.

Dry-run first as in phase 2 (`--pace 0.3 --retakes 0`). The dry run of `platform-owner` creates A, so after it either reset the stack or use `FILM_TAKE`.

Finish:

```bash
node scripts/showcase/console-up.mjs down --slot 2
cd desktop && node scripts/fix-stack.mjs down --slot 2
```

## 4. Render (no stack running; one film at a time)

```bash
node scripts/showcase/record-films.mjs --render-only --films role-admin
```

Do this for each recorded film. `--render-only` is the same as running `cd studio && node src/build.mjs <film> --chapters`, then the finalize gate on `studio/out/<film>.mp4` with frames written to `desktop/showcase/.work/frames/<film>/`.

- Each render converts the take from WebM to MP4 once, then renders at 1920x1080, 30 fps.
- Expect about 1.5 times the film's length. `STUDIO_CONCURRENCY` (default 4) caps the Chrome tabs.
- **Look at the frames** in `.work/frames/<film>/`. The white-flash check can fire on bright, mostly white app screens; that is cosmetic, so report it and do not retake for it.
- Each render also cuts the film's shorts into `studio/out/shorts/<film>/`.

Then the hero film, which needs the area recordings to exist:

```bash
cd studio && node src/build.mjs hero
node --no-warnings ../desktop/e2e/showcase/finalize.ts --name hero --video out/hero.mp4 --duration 60-120 --frames-dir ../desktop/showcase/.work/frames/hero
```

## 5. Master cut

```bash
cd studio && node src/master.mjs            # re-encode, drops repeated stings and end cards (about 30-45 min)
node --no-warnings ../desktop/e2e/showcase/finalize.ts --name master --video out/master.mp4 --duration 1800-4200
```

- Remove from `clips/master.json` any film that was not rendered. `ai-session` is not in the list by default.
- `node src/master.mjs --copy` joins the films in seconds and keeps every sting.
- Check `out/master.chapters.txt`. Its first line must be `0:00:00 Introduction`.

## 6. Gated: AI session (only with the owner's explicit yes)

- Budget: 12 AI requests in all. The spec closes the take after 6 counted POSTs; the other 6 are the message read and the pages that generate on open.
- It is never retried automatically.

```bash
cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db --ai && cd ..
E2E_API_URL=http://localhost:8807/api/v1 node --no-warnings backend/scripts/seed-demo.mjs
E2E_API_URL=http://localhost:8807/api/v1 node scripts/showcase/film-prep.mjs --demo
node scripts/showcase/record-films.mjs --slot 2 --films ai-session --ai --retakes 0     # SHOWCASE_AI=1 must also be set in the environment
cd desktop && node scripts/fix-stack.mjs down --slot 2                                   # never leave the AI binding running
```

1. Read the real total in Settings > AI usage and write it in the report.
2. Dry-run the page flow **without** `--ai` and with `SHOWCASE_AI` unset first. The spec then skips, so step through the pages by hand, or temporarily drop the `test.skip`. Without AI the pages only show their "AI is not configured" notice.

## 6b. Prospect films (a demo film for one prospective customer)

A prospect film is built and recorded with the same tools as the catalogue, but nothing about the prospect is ever committed (the repo is public).

- **Where things live.** Research, plans and drafts: `prospects/<name>/` (gitignored). The clip: `studio/clips/prospect-<name>.json` (gitignored). The recording spec: `desktop/e2e/showcase/films/prospect-<name>.spec.ts` (gitignored). Driver-app tests for it: `packages/driver_app/integration_test/prospect_*` (gitignored). Raw takes and renders go to the usual gitignored `.work` and `studio/out` folders. `node docs/videos/coverage.mjs` skips `prospect-*` clips.
- **Record and render it.** The clip is not in `docs/videos/films.json`, so it describes itself with a `film` object, and `--clip` records it through the same retake, gate and render path as a catalogue film:

  ```json
  { "film": { "stack": "single", "targetSec": 240, "shorts": false }, "recording": "prospect-<name>", "scenes": [ ... ] }
  ```

  ```bash
  node scripts/showcase/record-films.mjs --slot 2 --clip prospect-<name> --render
  ```

  A film that is recorded in several parts gives each scene its own `recording`, has one spec per part, and calls `recordFilm(page, context, '<part name>', testInfo, body, { clip: '<clip id>' })`. Record each part with `--clip <id>` pointing at a clip entry whose `film.clip` names the clip (the raw-take gate then counts only that part's scenes), or by hand: `build.mjs <clip> --no-render`, then `npx playwright test --config=e2e/showcase/films/playwright.films.config.ts --grep film:<part>`.
- **Speed.** A `screen` or `phone` scene takes `speed` (1, 1.5, 2, 3 or 4; default 1) and `speedLabel` (default `Sped up {speed}x`; `false` hides it). The film shows a small pill at the top right of the window while it plays faster. The spec does not change: `beat()` reads the scene's speed from the clip and holds for (narration + 0.65 s) x speed, so a long data-entry step is recorded at normal pace, played back quickly, and the narration is never sped up. The raw-take length gate in `record-films.mjs` sums each line times its scene's speed.
- **Film-kit helpers for on-camera navigation** (`desktop/e2e/showcase/films/film-kit.ts`): `navTo(page, href)` and `hoverNav(page, hrefs)` use the real sidebar (and throw if a link is not there instead of loading the page directly), `tab(page, name)` clicks a sub-tab, `showInPhoneFrame(page, url)` shows an app page in a 390 px phone, and `showPdf(page, file)` renders a downloaded PDF with pdf.js from `node_modules/pdfjs-dist` (the `pdfjs-dist` devDependency of `desktop`; no CDN). `desktop/e2e/showcase/films/film-kit.spec.ts` (`--grep "kit:"`) exercises them.
- **The AI guard.** A prospect film must show what the AI does without spending the owner's AI budget by accident. `aiGuard(page, { budget, live })` counts every AI request the browser makes (non-GET under `/api/v1/ai/` except `/ai/settings`, the social-content and suggestion generators, and the pages that generate when opened: the BI forecasts and the insights page), `guard.server(n)` adds the model calls the server makes on its own, a request that would pass the budget is aborted before it leaves the browser, and `beat()` fails the take at the next scene. `live: false` means no budget. Live AI still needs the owner's yes, a stack started with `--ai` and `SHOWCASE_AI=1` (section 6); `ai-session.spec.ts` is the model to copy. End the take with `guard.report()`.
- **Driver app for a prospect.** `scripts/record-driver.ps1 -Test integration_test/prospect_<name>.dart -AgencyCode <code> -Out desktop/showcase/.work/driver-<name>.mp4` records another flow and writes `driver-<name>-marks.json`. A clip scene then uses `"recording": "driver-<name>"` (any name starting with `driver-` is a driver recording) with `markText`, as for `driver`.

## 7. Report back

1. Each film: number of takes, and whether it was recorded and rendered.
2. Findings, with frame paths: gate failures and cosmetic notes.
3. The output of `record-films.mjs` (`desktop/showcase/.work/record-films-<time>.json`).
4. Durations of `studio/out/*.mp4`, and the number of shorts.
5. Any spec or clip edits you made. If a narration line changed, its audio was re-synthesised.

## Troubleshooting

- **`beat "<id>" has no screen scene`, or `steps ... never played`:** the spec and the clip have drifted apart. Make them match, then run `node docs/videos/coverage.mjs`.
- **`step not found in marks`** in `build.mjs`: the take aborted before that step. Look at `desktop/showcase/.work/fail-<film>.png`.
- **A scene visibly slows or freezes on its last frame:** the actions finished faster than the line plus the pause. That cannot happen with a TTS manifest, because the beat waits for the line. Re-run phase 1 for the film, then retake.
- **Demo admin left with two-factor on** (an aborted settings take): sign in as another admin, or reseed.
- **Calling left on** after an aborted calls take: `film-prep` does not reset it. Reseed, or POST `/admin/tenants/<demo id>/voip/close` with a `/test/super-admin` token.
