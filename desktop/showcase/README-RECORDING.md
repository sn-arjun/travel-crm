# Recording the demo videos

Source of truth for content: `STORYBOARD.md`. This file is how to run the machinery.

## One-time setup
- Stack (production build, never `next dev`): `cd desktop && node scripts/fix-stack.mjs up --slot N --reset-db`
  (slot N: API `8787+10N`, web `3100+10N`). Everything below takes `--slot N` / `SHOWCASE_SLOT=N`, or `E2E_API_URL` + `E2E_BASE_URL`.
- ffmpeg: add `ffmpeg-static` (already in `desktop/package.json` devDependencies; until the lockfile is refreshed use
  `npm install --prefix desktop/showcase/.tools ffmpeg-static`). `FFMPEG=<path>` overrides.
- Node >= 22.18 (the seeder and gate are plain `.ts` run by node type stripping, no tsx).
- Emulator AVD `Resizable_Experimental` (1080x2400). Flutter only via the x86 PowerShell (record-driver.ps1 does that).
  First driver run: pass `-NoRecord -AcceptLocationDialog` once so the Google "Location Accuracy" dialog is accepted off camera.

## Stages (`node scripts/record-demo.mjs --slot N [--from <stage>] [--only <stage>] [--skip-driver]`)
`preflight` -> `seed` -> `storyA` -> `driver` -> `storyB` -> `walkthrough` -> `smoke` -> `compose` -> `finalize`
- `storyA` / `storyB` = `e2e/showcase/story.spec.ts` (scenes 1-6 and 8-9); `driver` = scene 7 on the emulator.
- `walkthrough` re-seeds, then records seven independent parts: `wt1` (full-walkthrough.spec.ts) and `wt2`..`wt7` (`wtN.spec.ts`). A failed part is re-seeded and retaken alone
  (`--parts wt3,wt5` re-records only those). `compose` joins them in order and inserts the driver clip as chapter 21 after `wt4`.

- Chapter 37 (AI) is its own part `wtai` (`wtai.spec.ts`, 3 real Workers AI requests per take, billed). It is skipped by `walkthrough` unless `--ai` is passed, needs a stack started with
  `node scripts/fix-stack.mjs up --slot N --ai`, runs with `SHOWCASE_AI=1`, and is never retried automatically. Develop it WITHOUT `--ai` (same clicks, the "AI is not configured yet" notice is the expected result).
  Order in the video: wt1..wt6, wtai, wt7.

### Exact commands (slot 2 shown; run from the repo root, stack up with `cd desktop && node scripts/fix-stack.mjs up --slot 2 --reset-db`)
```bash
# whole thing, 08:00-20:30 IST
node scripts/record-demo.mjs --slot 2
# outside the window: the airport pickup is pinned to an afternoon slot so the story still reads "this afternoon"
SHOWCASE_IGNORE_WINDOW=1 DEMO_PICKUP=14:45 node scripts/record-demo.mjs --slot 2
# story only (seed, scenes 1-6, driver, scenes 8-9), then compose + gate
node scripts/record-demo.mjs --slot 2 --only seed && node scripts/record-demo.mjs --slot 2 --only storyA && node scripts/record-demo.mjs --slot 2 --only driver \
  && node scripts/record-demo.mjs --slot 2 --only storyB && node scripts/record-demo.mjs --slot 2 --only compose
# walkthrough only / one part
node scripts/record-demo.mjs --slot 2 --only walkthrough
node scripts/record-demo.mjs --slot 2 --only walkthrough --parts wt4
node scripts/record-demo.mjs --slot 2 --from compose
```
Fast dry run of one part (about 1/6 of real time): `SHOWCASE_PACE=0.15 npx playwright test --config=playwright.showcase.config.ts --grep "wt3:"` (from `desktop/`, with `E2E_BASE_URL` / `E2E_API_URL`).
Delete stale `.work/wt*.webm` / `partA.webm` after dry runs: `compose` treats their presence as "recorded".
- `compose` builds story/full cuts when their takes exist, otherwise `.work/proof.mp4` from `smoke.webm` + `driver.mp4`.
- A failure stops the run and names the stage; fix and resume with `--from`.

## Individual commands
| What | Command |
|---|---|
| Seed (reset + API + SQL fixups + verify) | `E2E_API_URL=... node --no-warnings backend/scripts/seed-demo.mjs` |
| Today airport trip for Ravi (retake-safe) | `node --no-warnings backend/scripts/seed-demo.mjs --live-trip` -> `desktop/showcase/.handoff.json` |
| Pre-roll / between-takes SQL | `... seed-demo.mjs --pre-roll` / `--between-takes` |
| Harness smoke clip | `cd desktop && E2E_BASE_URL=... E2E_API_URL=... npx playwright test --config=playwright.showcase.config.ts smoke` |
| Driver clip | `pwsh -File scripts/record-driver.ps1 -Slot N` (`-NoRecord` dry run, `-DebugShots`, `-Pace 80` to shorten) |
| Compose proof | `E2E_BASE_URL=... node --no-warnings scripts/showcase/compose.mjs proof --desktop .work/smoke.webm --desktop-marks .work/marks-smoke.json --driver .work/driver.mp4 --driver-marks .work/driver-marks.json --out .work/proof.mp4` |
| Quality gate | `node --no-warnings desktop/e2e/showcase/finalize.ts --name X --video F --frames-dir D [--violations F] [--duration lo-hi] [--min-chapter S]` |

## Files
- `desktop/e2e/showcase/`: `demo-data.ts` (dataset), `demo-seed.ts` (API seeding), `cursor-overlay.ts` + `showcase-helpers.ts` (harness), `finalize.ts` (gate + chapters), `smoke.spec.ts`.
- `scripts/showcase/`: `ffmpeg.mjs`, `cards.mjs` (HTML -> PNG), `compose.mjs`.
- `.work/` (gitignored): seed.json, marks-*.json, violations-*.json, *.webm, driver.mp4, driver-marks.json, proof.mp4, frames/.

## Rules the harness enforces
No slowMo (explicit pauses only). No on-camera failure captions: any console error, pageerror, HTTP >= 400 (allowlisted exceptions), banned string
(`BANNED_PATTERNS`), visible validation/error UI throws at `assertClean()` and aborts the take; the gate re-checks violations, durations,
chapter lengths and white/black flashes.
