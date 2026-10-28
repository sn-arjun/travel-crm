# studio: local narrated-video pipeline

Turns a clip description (`clips/<id>.json`) plus an existing silent screen recording into a narrated, branded MP4 with captions. Everything runs locally and free: Kokoro-82M text-to-speech (CPU), Remotion (React) for motion graphics and compositing, ffmpeg from `ffmpeg-static`. No API keys.

`studio/` is its own npm project (not a root workspace). Install once: `cd studio && npm install`.

## Render a clip

    cd studio
    node src/build.mjs pilot-assistant            # full render -> out/pilot-assistant.mp4 (+ .srt, .chapters.txt, .timeline.json)
    node src/build.mjs pilot-assistant --no-render   # narration + timeline + SRT only (about 1 min, no Chrome)
    node src/build.mjs pilot-assistant --still=22    # one PNG frame at 22 s -> tmp/
    node src/auditions.mjs                        # same sentence in three voices -> out/auditions/
    npx remotion studio src/index.ts              # live preview of the kit (needs a timeline prop)

First run downloads the Kokoro model (about 90 MB, into `models/`) and Remotion's headless Chrome (about 120 MB).

## Add a clip

Create `clips/<id>.json`. Copy `clips/pilot-assistant.json`. Scenes play in order:

| type | fields |
|---|---|
| `logo` | `dur` |
| `title` | `title`, `subtitle`, `kicker`, `narration` |
| `screen` | `in`, `out` (seconds of `source`), `narration`, `lowerThird {feature, role, plan}`, `zoom {x,y,scale,start,end}`, `callout {x,y,label,at,r,side}`, `chapter`, `speed`, `speedLabel` |
| `phone` | `recording`, `markText` or `in`/`out`, `heading`, `sub`, `lowerThird`, `speed`, `speedLabel` |
| `flow` | `heading`, `steps [{label, sub}]`, `narration` |
| `plans` | `heading`, `rows [{label, plans:[basic,pro,enterprise]}]` (PlanMatrix) |
| `end` | `headline`, `cta`, `url`, `narration` |

`speed` (screen and phone scenes; 1, 1.5, 2, 3 or 4, default 1) plays the recorded segment faster, and `speedLabel` (default `Sped up {speed}x`, `false` hides it) is the pill shown at the top right of the window while it does. A scene lasts at least (`out` - `in`) / `speed`; the narration is never sped up, and a scene without `speed` renders exactly as before. For a narration-paced recording the spec does not change: `beat()` reads the speed from the clip and holds for (narration + 0.65 s) x speed. A clip that is not in `docs/videos/films.json` (a prospect film, `studio/clips/prospect-*.json`, gitignored) declares `film: { stack, targetSec }` so `scripts/showcase/record-films.mjs --clip <id>` can record it; see the runbook's section 6b.

`source` is relative to the repo root; `cropBottom` (default 0.14) hides the caption strip burned into the existing recordings so it does not double up with ours. Zoom and callout x,y are fractions (0..1) of the source frame; `start`, `end` and `at` are seconds into the scene. Pick segments by extracting frames (`ffmpeg -ss T -i src -frames:v 1`) and looking at them before writing narration.

## Change the voice

Set `"voice"` in the clip JSON (per clip) or on a single scene. Kokoro voices used so far: `bf_emma` (British female, pilot voice), `bm_george` (British male), `af_heart` (American female). Others: `bf_isabella`, `bm_lewis`, `am_michael`, `af_bella`, ... Narration lines are cached by a hash of model + voice + text, so only changed lines are regenerated. Each WAV has leading silence trimmed and is loudness-normalised (loudnorm, -16 LUFS) so lines match.

## Narration-first timing rule

A scene lasts at least `narration + 0.4 s` (plus a 0.25 s lead-in). If the source segment is shorter, the video slows down (never below 0.8x) and then holds the last frame. If the segment is longer, the narration starts at the scene start and the video keeps playing. Narration is never sped up. Captions are chunks of at most 9 words timed in proportion to character count inside the line's audio span.

## Optional music

`Clip` has an unused `music` prop (file under the public dir, played at volume 0.08). Nothing passes it by default.

## How recording can pace itself to the narration (not implemented, do not edit yet)

`out/narration/<clip>/narration.json` lists each line: `id`, `file`, `duration` (seconds), `text`. A future recording step can read it so that `say()` in `desktop/e2e/showcase/showcase-helpers.ts` paces each on-screen step to its line:

1. Load the manifest once at the start of the take, keyed by a stable step id (or by order).
2. In `say(text, stepId)`, show the lower-third as today, then `await page.waitForTimeout(duration * 1000 + 400)` (or until the remaining actions have run, whichever is longer) before the next step.
3. Write the elapsed start time of every step into the take's `marks-*.json` as it does now, so `build.mjs` can set each scene's `in`/`out` straight from those marks instead of from hand-picked times.
4. Stop burning captions into the recording (our `Captions` component draws them), which also removes the need for `cropBottom`.

## Licences

- Kokoro-82M model and `kokoro-js`: Apache-2.0.
- Remotion: free for individuals and companies of up to 3 people; larger companies need a paid company licence. See https://www.remotion.pro/license (and https://www.remotion.dev/docs/license).
- Fonts DM Sans and Geist via `@fontsource-variable/*`: SIL OFL. ffmpeg-static builds are GPL: used only as a local tool, not redistributed.

## Measured on this machine (Windows 11, CPU only)

- Kokoro q8: about 1x real time (a 8 s line takes 7-9 s); whole 8-line pilot about 1 min.
- Remotion render of the 74-76 s pilot at 1920x1080 / 30 fps: 301 s the first time (includes the Chrome download warm-up and cold cache), 115 s on the second render. Output about 19 MB.
- Disk: `node_modules` 1.6 GB, `models` 89 MB, `.cache` (bundle plus copied source recording) 36 MB plus Chrome (about 300 MB in node_modules/.remotion).
