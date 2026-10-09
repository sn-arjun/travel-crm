<!-- Read-only explorer report, 2026-10-09. Static reading only; nothing was built or run. Verify before relying on a line number. -->

Exploration is complete; nothing was modified, built, installed or tested. All paths are under `C:/Users/Admin/Downloads/pro/CRM/`. No secret values are printed anywhere below.

## 0. Urgent: a live credential is stored in the repo's git config

- **GitHub token in the remote URL.** The `sn-arjun` remote in `.git/config` embeds a GitHub personal access token in the URL (`https://sn-arjun:<token>@github.com/sn-arjun/travel-crm.git`). Any `git remote -v` prints it. It should be revoked and the URL reset before anything else.
- **`.dev.vars` is in git history.** `backend/.dev.vars` was committed in `c668ebd` (2026-02-22) and `6d75a0b` (2026-08-07); it is now untracked and ignored. None of the values in the `c668ebd` copy match real provider key formats, so they look like dev fakes (I only format-checked that copy). `.gitignore` lines 71-73 still say to rotate.
- **Hardcoded admin defaults are tracked.** `super-admin/wrangler.toml:15-21` has a `[vars]` block with a placeholder JWT secret and a default super-admin email and password in plain text. The same defaults are fallbacks in `super-admin/src/app/api/auth/route.ts:12`, `super-admin/src/app/api/auth/seed/route.ts:12-13`, `super-admin/src/lib/session.ts:3`, `super-admin/src/middleware.ts:4` and `terraform/variables.tf:210-221`.

## 1. Repo clutter

### Git state
- **Remote:** one remote, `sn-arjun` → `github.com/sn-arjun/travel-crm.git`. The only remote branch is `sn-arjun/master` at `08312a4`.
- **Branches:** `assistant-automation` (current) and `ui-remake` both sit at `3466c38`, 237 commits ahead of `master` and 0 behind. Neither is pushed.
- **Stale branches:** `worktree-agent-a192c6e9561f5a1cc`, `worktree-agent-a9958c4b3ecdb3691` and `worktree-agent-ab833e0e4b1d45d7e` remain, but `.claude/worktrees/` does not exist and `git worktree list` shows only the main checkout.
- **Working tree:** about 60 modified files are uncommitted (27 in `backend/src`, about 25 in `desktop/`, plus `scripts/showcase/cards.mjs` and `compose.mjs`), and 7 tracked files under `desktop/showcase/.artifacts/` are deleted.
- **Size:** 1,984 tracked files: desktop 799, packages 657, backend 296, super-admin 115.

### Candidates

| Path | What it is | Size / files | Tracked | Referenced by |
|---|---|---|---|---|
| `.~lock.TravelCRM_PRD_Coverage_Audit.xlsx#` | LibreOffice lock file dated 2026-03-06 | 108 B | yes (1) | nothing |
| `everything-claude-code/` | Nested clone of `github.com/affaan-m/everything-claude-code` (HEAD `e3314f4`, 2026-03-07) | 34 MB / 823 | yes, as a gitlink (mode 160000) with no `.gitmodules` | nothing in the repo |
| `e2e/` (root) | Old Playwright suite for milestones M1-M11, dated Feb 2026, defaults to `localhost:3000` | 14 MB / 584 (mostly `node_modules`) | 25 | no script, workflow or turbo task; superseded by `desktop/e2e/` (about 55 specs) |
| `oci-provisioner/` | Node service plus Dockerfile and Caddyfile for per-tenant WordPress on OCI | 16 KB / 6 | 6 | only `README.md:155`; `PROVISIONER_SECRET` default is `'change-me'` (`src/server.ts:11`) |
| `docs/` | Only `docs/archive/`: 9 milestone and E2E reports from Feb-Mar plus 3 audit `.xlsx` files | 316 KB / 12 | 12 | nothing |
| `product-requirment/` (misspelt) | PRD, milestones, 25 Jira ticket files, pricing cost models, design and UX specs | 2.7 MB / 41 | 0 (gitignored, `.gitignore:2`) | `scripts/milestone-pipeline.js`, `.claude/commands/*` |
| `PRD-AUDIT-REPORT.md` | PRD vs implementation audit, 2026-03-07 | 38 KB | yes | nothing |
| `INTERNATIONAL-FEATURES-SHEET.md` | Feature wishlist for international markets, 2026-02-28 | 14 KB | yes | nothing |
| `desktop/audit/` | 13 milestone audits (March), `fix/` (bug inventory, 32 batch JSONs, gates, screenshots), `remake/` | 158 MB / 1,697 | 211 (123 json, 52 png, 35 md) | `desktop/scripts/lint-gate.mjs` and `fix-gates.mjs` read `audit/fix/lint-baseline.json` and `gate-baseline.json`; `scripts/remake-pipeline.js` |
| `desktop/showcase/` | Demo video outputs and docs | 1,020 MB / 313 | 20 | `scripts/record-demo.mjs`, `scripts/showcase/*` |
| `.claude/` | 12 slash commands, 1 plan doc, `settings.local.json` | 132 KB / 14 | 14 | Claude Code only; no secret patterns in `settings.local.json` |
| `scripts/` | See below | 229 KB / 14 | 14 | root `package.json` uses only `sync-config.sh` and `push-secrets.sh` |
| `terraform/` | Cloudflare and Oracle Cloud infrastructure | 69 KB / 17 | 14 | root `package.json` `infra*` scripts, `terraform.yml` |

`scripts/` breaks down as:
- **Product/ops:** `sync-config.sh`, `push-secrets.sh`.
- **Demo tooling:** `record-demo.mjs`, `record-driver.ps1`, `showcase/{compose,cards,ffmpeg}.mjs`.
- **Agent pipelines, not product:** `milestone-pipeline.js`, `remake-pipeline.js`, `run-pipeline.sh`, `generate-audit-xlsx.mjs`, `PIPELINE-GUIDE.md`, `REMAKE-GUIDE.md`.

### Other tracked junk
- **Backend logs:** 23 files in `backend/` (`test-err*.log`, `test-output*.log`, `tsc.log`), plus `backend/MILESTONE_10_IMPLEMENTATION.md`, which contains sandbox paths like `/sessions/sleepy-inspiring-feynman/...`.
- **crm_app scratch files:** `analyze_out.txt`, `analyze_vouchers.txt`, `build_out.txt`, `fix_script.dart`, `fix_script.py`, and a file with a mangled name, `"packages/crm_app/C\357\200\272UsersAdminDownloadsproanalyze_output.txt"`.
- **crm_app untracked logs:** about 20 more `*.log` files on disk (`flutter-web*.log` at about 257 KB each, `build_errors*.log`, `analyze.log`).
- **Desktop leftovers:** `desktop/FLEET_FILES_SUMMARY.txt`, `FLEET_MODULE_STRUCTURE.md`, `FLEET_QUICKSTART.md`, `README_FLEET_MODULE.md` (March, describe a mock-data fleet module); untracked `desktop/showcase-run.log`.
- **Recordings in git:** `desktop/showcase/report/` holds three `.webm` files (131 MB, 99 MB, 0.3 MB) plus an 816 KB `index.html`. Seven files under `desktop/showcase/.artifacts/` are tracked even though `desktop/showcase/.gitignore` ignores that folder.

### Large tracked files
1. `desktop/showcase/report/data/3e8d8478….webm` — 131 MB (over GitHub's 100 MB limit)
2. `desktop/showcase/report/data/462847e7….webm` — 99 MB
3. `package-lock.json` — 1.1 MB
4. `desktop/showcase/report/index.html` — 816 KB
5. `landing/public/images/**` — 9 JPGs, 228-668 KB each
6. `super-admin/package-lock.json` — 584 KB
7. `backend/worker-configuration.d.ts` — 420 KB
8. `backend/package-lock.json` — 240 KB
9. `desktop/audit/fix/shots/*.png` — up to 224 KB each

### Secret-looking tracked files
The grep returns only `.env.example`, `desktop/.env.example`, `desktop/src/lib/api/.env.example` (a duplicate) and `scripts/push-secrets.sh`. No keystore, `.jks`, `.pem`, `google-services.json` or `GoogleService-Info.plist` exists anywhere, tracked or not.

### `.gitignore` problems
- **`*.js` (line 15)** was meant for compiled Dart but ignores all JavaScript; only `scripts/*.js` is re-included (line 26). As a result `landing/main.js` exists on disk and is untracked, so a fresh clone gets a landing page with no JS.
- **`*.tfvars` (line 82)** ignores `terraform/environments/{dev,staging,prod}.tfvars`. The negation `!environments/*.tfvars` (line 84) is root-anchored and does not match; `git check-ignore` confirms. The files are untracked, yet `terraform.yml` passes `-var-file=environments/prod.tfvars`.
- **`**/pubspec.lock` (line 10)** leaves the Flutter apps with no lockfile in git.
- **`.log` (line 113)** is a typo for `*.log`.
- **`**/android/gradlew` and `gradlew.bat`** are ignored (lines 29-30).

## 2. Build and release config per app

### desktop (Electron + Next.js)
- **Manifest:** `desktop/package.json` — `travelcrm-desktop` 0.1.0, `main: electron/dist/main.js`.
- **Versions:** Next 16.1.6, React 19.2.3, Electron ^34, electron-builder ^25.1, Tailwind 4, Zod 4, Vitest 3, Playwright ^1.50.
- **Scripts:** `build` = `next build`; `build:electron` = `next build && tsc -p electron/tsconfig.json`; `build:desktop` = that plus `electron-builder --config electron-builder.yml`. Also `lint`, `lint:gate`, `gates`, `typecheck`, `test`, `test:e2e`. There is no `storybook` dependency although `storybook` scripts exist.
- **`desktop/electron-builder.yml`:**
  - appId `com.travelcrm.desktop`, productName `TravelCRM Pro`, output `release/`, `buildResources: public`.
  - Targets: Windows NSIS x64, macOS DMG x64+arm64, Linux AppImage x64.
  - Icons are `public/icon.ico`, `public/icon.icns`, `public/icon.png`, but `desktop/public/` does not exist.
  - No code-signing keys (no `certificateFile`, `mac.identity`, notarize or entitlements).
  - `publish` is GitHub with `owner: your-org` (line 50), a placeholder.
  - No `electron-updater` or `autoUpdater` anywhere, so there is no auto-update.
- **`desktop/next.config.ts`:** `output: 'standalone'`, `images.unoptimized`, transpiles `@travelcrm/shared`.
- **`desktop/electron/main.ts`:**
  - In production it calls `loadFile('../.next/server/app/index.html')` and falls back to `loadURL('http://localhost:3000')` (lines 40-46). Nothing spawns a Next server, and the builder's `files` list does not include the standalone server's `node_modules`.
  - The tray icon is `nativeImage.createEmpty()`, commented "placeholder" (lines 79-81).
  - It registers a global `CmdOrCtrl+K` shortcut (line 214).
- **API URL:** `desktop/src/lib/api/config.ts:1` reads `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8787/api/v1`. It is inlined at build time. There is no `.env.production`; `desktop/.env.local` holds only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Deploy:** root `deploy:desktop` runs `wrangler pages deploy desktop/.next --project-name travelcrm-desktop`. A raw `.next` folder from a standalone build is not a Pages static output, and no `travelcrm-desktop` Pages project exists in `terraform/modules/cloudflare/pages.tf`.

### super-admin (Next.js)
- **Manifest:** `super-admin/package.json` — 0.1.0, Next 16.1.6, React 19.2.3, `@opennextjs/cloudflare` ^1.17.1. Scripts are only `dev`, `build`, `start`, `lint`.
- **Adapter mismatch:**
  - All 34 API routes use `getCloudflareContext()` from `@opennextjs/cloudflare` (for example `src/app/api/auth/route.ts:10`).
  - There is no `open-next.config.ts` and no build or deploy script for OpenNext.
  - `super-admin/wrangler.toml:4` sets `pages_build_output_dir = ".vercel/output/static"`, and `deploy-admin.yml:34`, `pages.tf:35` and root `deploy:admin` all use `@cloudflare/next-on-pages`. That package is not a dependency, and no route exports `runtime = 'edge'`.
- **Bindings:** `super-admin/wrangler.toml` binds `MASTER_DB` (placeholder id `a0000000-…0001`) and `R2_BUCKET` → `travelcrm-assets`. That bucket is not in Terraform, which creates only `travelcrm-files`.
- **No backend API URL:** it talks to D1 directly, and to the Cloudflare REST API for tenant provisioning (`src/app/api/tenants/provision/route.ts:78-84`).
- **Razorpay webhook:** `src/app/api/webhooks/razorpay/route.ts:11-12` skips signature verification when `RAZORPAY_WEBHOOK_SECRET` is unset.
- **Seed route:** `/api/auth/seed` sits under the public `/api/auth` prefix (`middleware.ts:3`).
- **Plan names disagree:** `super-admin/src/lib/constants.ts:3` has `free, starter, pro, enterprise`; `backend/src/db/master-schema.ts:11` has `trial, basic, pro, enterprise`; the landing page says Starter, Professional, Enterprise.
- **Boilerplate:** `README.md` and `public/` are untouched create-next-app defaults.
- **Duplicate admin UI:** the desktop app has its own `/super-admin/*` pages (9 under `desktop/src/app/(app)/super-admin/`) calling the backend's `/admin/*` routes.

### landing
- **What it is:** plain static HTML: `landing/index.html` (644 lines), `styles.css`, `main.js` (untracked, see section 1), `public/robots.txt`, 9 JPGs. No framework, `package.json` or build step. Lucide icons load from `unpkg.com/lucide@latest` (line 641).
- **Sections:** one page with hero, proof, three feature blocks, AI, pricing, testimonials, FAQ, CTA and footer.
- **No forms:** there is no `<form>` and no `fetch`. Every "Start Free Trial", "Watch Demo", "WhatsApp Us" and pricing CTA is `href="#"`. The only working contact links are `mailto:hello@travelcrm.pro` and `tel:+919876543210` (line 588, a placeholder-style number).
- **Pricing shown:** Starter $12 / ₹999, Professional $29 / ₹2,399, Enterprise $49 / ₹3,999 per user per month, with a "14-day free trial".
- **Unverified claims:** "500+ Travel Agencies", "$2.4M+", "99.9% Uptime", six named agencies (lines 180-191), three named testimonials, and JSON-LD `aggregateRating` 4.9 from 127 ratings (line 637).
- **Dead or missing:** all footer links are `#` (Privacy, Terms, GDPR, Security, API Docs, About, Blog, socials). `og-image.png`, a favicon and `sitemap.xml` (cited in `robots.txt`) do not exist. The canonical domain is `https://travelcrm.pro`.
- **No deploy path:** nothing in root `package.json`, any workflow or Terraform refers to `landing/`. Terraform points the root domain at the Flutter web Pages project (`modules/cloudflare/main.tf:11-18`).

### backend (Cloudflare Workers)
- **Manifest:** `backend/package.json` — `travelcrm-api` 1.0.0, Hono ^4.12, drizzle-orm ^0.45, Zod 4, jose, wrangler ^4.148.0, vitest 2.1.8 with `@cloudflare/vitest-pool-workers` ^0.5.21.
- **Scripts:** `deploy`, `deploy:staging`, `deploy:production` (`wrangler deploy --env …`), `typecheck`, `db:generate`, `db:migrate`, `db:studio`.
- **Lockfile out of sync:** `backend/package-lock.json` records `"wrangler": "^4.67.0"` (line 32) while `package.json` says `^4.148.0`, so `npm ci` in `backend/` will refuse to install.
- **`backend/wrangler.toml`:** full binding list is in section 4. The points beyond what you already have:
  - Every D1 and KV id is a placeholder (`a0000000-…`, lines 10, 21, 25, 29).
  - There are no `[vars]`, `routes`, custom domain or `[observability]`.
  - `MASTER_DB` has `migrations_dir = "drizzle/tenant"` (line 11), while master migrations live in `backend/drizzle/master/` (10 files). `db:migrate` therefore applies tenant migrations to the master DB locally, and nothing applies the master migrations.
  - `[env.production]` and the top level share the name `travelcrm-api`.
- **Tenant databases:** `backend/src/services/tenant-db.ts:45-50` looks for a `TENANT_DB_<id>` binding and otherwise falls back to `MASTER_DB`. No such bindings are declared, so all tenants share one D1 unless bindings are added per tenant and redeployed.
- **CORS:** `backend/src/index.ts:130-146` allows only `localhost:3000/3100/8080` and `*.pages.dev`. No custom production domain is allowed, and `ENVIRONMENT` is read but never set.
- **Cron:** a single `*/5 * * * *` trigger runs every job on each tick, including `resetUsageCaps(…, 'daily')` (`index.ts:373-389`).
- **Hardcoded production URLs:**
  - `https://app.travelcrm.pro` — `routes/auth.ts:571`, `routes/users.ts:312`, `routes/admin.ts:669`
  - `https://quotes.travelcrm.pro` — `routes/itineraries.ts:875`
  - `noreply@travelcrm.pro` — `services/sendgrid.ts:101,175,266`, `services/email.ts:25`, `queues/campaign-queue.ts:232`
- **No signup:** there is no `/register`, `/signup` or trial route in `backend/src/routes`.

### packages/crm_app (Flutter)
- **Manifest:** `pubspec.yaml` — 1.0.0+1, Dart `^3.11.0`, Riverpod 2.6, go_router 14, dio, hive, local_auth. No Firebase or push package.
- **Windows packaging:** `msix_config` (lines 84-91) points at `assets/icons/app_icon.png`, but no `assets/` directory exists and `msix` is not a dev dependency.
- **API URL:** `lib/core/constants/app_config.dart:6-9` — `API_BASE_URL` via `--dart-define`, default `http://localhost:8787`. Also `ENVIRONMENT` and `GOOGLE_PLACES_API_KEY`.
- **Android (`android/app/build.gradle.kts`):**
  - `applicationId = "com.travelcrm.crm_app"`, with the template TODO still on line 23.
  - Release is signed with the debug key (line 37); there is no `key.properties` or keystore.
  - `AndroidManifest.xml` label is `crm_app` (line 5) and the main manifest does not declare `INTERNET`, only biometric permissions (lines 2-3).
  - Launcher icons have the default Flutter template file sizes.
- **iOS:** bundle id `com.travelcrm.crmApp`, display name "Crm App" (`Info.plist:10`), automatic signing with no `DEVELOPMENT_TEAM`, default icons, no Podfile or ExportOptions.
- **Web:** `web/manifest.json` has name `crm_app` and description "A new Flutter project." (lines 2-8).
- **Windows runner:** `Runner.rc:93,98` has ProductName `crm_app`.
- **Other:** `README.md` is the Flutter template. `bulk_send_screen.dart:50-53` has a hardcoded John Doe / Jane Smith recipient list. There is no store metadata or fastlane.

### packages/driver_app (Flutter)
- **Manifest:** `pubspec.yaml` — 1.0.0+1, with geolocator, image_picker, dio, hive.
- **Build-time defines:** `lib/core/constants/app_config.dart` — `API_BASE_URL` (default localhost), `ENVIRONMENT`, and `TENANT_ID`, whose default is the local demo tenant id (lines 9-14). One build therefore serves exactly one tenant.
- **Environment check mismatch:** `isProd` compares against `'prod'` (line 22), while crm_app, shared and the CI use `'production'`.
- **Android:** `applicationId = "com.travelcrm.driver_app"`, debug-key release signing (line 37), label "TravelCRM Driver", `INTERNET` and location permissions present, default icons.
- **iOS:** bundle id `com.travelcrm.driverApp`, display name "Driver App". `Info.plist` has no `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription` or `NSPhotoLibraryUsageDescription`, which geolocator and image_picker need.
- **CI:** no workflow builds driver_app at all.

### packages/shared and packages/shared-ts
- **`packages/shared`:** Dart package 0.0.1 requiring Flutter `>=3.41.0`. `lib/constants/app_constants.dart:5-8` is a third copy of the `API_BASE_URL` default.
- **`packages/shared-ts`:** `@travelcrm/shared` 0.1.0, ESM, `build` = `tsc`, `main` = `dist/index.js`. Because `dist/` and `*.js` are gitignored, it must be built before desktop; root `build:desktop` does that.

## 3. CI/CD

All seven workflows trigger on `main`, `develop` or `release`. The repository's only pushed branch is `master`, so no push trigger fires today.

| Workflow | What it does | Secrets / vars | Would it pass? |
|---|---|---|---|
| `test.yml` | Backend `tsc` + `vitest`; Flutter analyze and test (crm_app, shared); `next build` for super-admin | none | Flutter jobs fail: `FLUTTER_VERSION: '3.24.x'` (line 10) vs `sdk: ^3.11.0`. Backend `npm ci` fails on the out-of-sync lockfile. Flutter tests are `\|\| true` (lines 113, 116). driver_app and desktop are not covered. |
| `desktop-ci.yml` | Lint, typecheck, vitest, `next build`, then an Electron matrix (ubuntu/windows/macos) on `main` only | `GITHUB_TOKEN` | Lint, typecheck, vitest and build passed locally per `desktop/audit/fix/FINAL-E2E.md` (not re-run here). The Electron job would fail on missing icons and `owner: your-org`. |
| `deploy-backend.yml` | `tsc`, then `wrangler deploy --env production`, then curl health check | `CLOUDFLARE_API_TOKEN`, `vars.DOMAIN` | `npm ci` fails on the lockfile. A deploy would use placeholder ids. The health check ends in `\|\| echo` and cannot fail (line 67). |
| `deploy-crm.yml` | melos bootstrap, codegen, analyze, `flutter build web --web-renderer canvaskit`, Pages deploy to `travelcrm-web` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `vars.API_BASE_URL` | Uses Flutter 3.41.1. I believe `--web-renderer` was removed from recent Flutter, which would break this step; please verify. `dart analyze --fatal-infos` is strict. |
| `deploy-admin.yml` | `npx @cloudflare/next-on-pages`, Pages deploy to `travelcrm-admin` | same two Cloudflare secrets | Fails: adapter mismatch described in section 2. |
| `release.yml` | crm_app Android AAB, iOS IPA `--no-codesign`, Windows + MSIX, web | `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | Fails on Flutter 3.24.x. The keystore secrets are never read by Gradle. `dart run msix:create` has no package. No `--dart-define`, so artifacts would point at localhost. |
| `terraform.yml` | Plan on PR, `apply -auto-approve` on main | OCI ×4, Cloudflare ×2, R2 ×2 | Fails: `environments/prod.tfvars` is not in git. The `domain` variable has no default and no `TF_VAR_domain`. `terraform init` gets no R2 endpoint (`providers.tf:25-26`). |

**Root `package.json`**
- Workspaces: `packages/shared-ts`, `desktop`, `backend`, `super-admin`. Backend and super-admin are also installed standalone with their own lockfiles.
- `build` = desktop + admin only.
- `deploy` = `infra` (terraform `apply -auto-approve`) → `secrets:push` → `deploy:api` → `deploy:desktop` → `deploy:admin`.
- `test` = backend vitest + melos; it does not include desktop.
- The README documents `deploy:web`, `build:web` and `build:windows`, which do not exist.

**`turbo.json`** defines build, dev, lint, typecheck and test tasks, but no script calls `turbo`.

**`melos.yaml`** has `repository: https://github.com/your-org/travel-crm` (placeholder) and a `build:web` script that uses `--web-renderer canvaskit`.

## 4. Environment variables and keys

"Set locally" means a real-looking value is present on this machine. Only `backend/.dev.vars` and `desktop/.env.local` exist; there is no `terraform/terraform.tfvars`, no `.env`, and no super-admin env file.

### Backend bindings (`backend/wrangler.toml`)

| Kind | Bindings declared |
|---|---|
| D1 | `MASTER_DB` → `travelcrm-master` |
| R2 | `FILE_STORAGE` → `travelcrm-files` |
| KV | `CACHE`, `SESSIONS`, `REPORT_CACHE` |
| Queue producers | `EMAIL_QUEUE`, `SMS_QUEUE`, `PUSH_NOTIFICATION_QUEUE`, `WP_PROVISION_QUEUE`, `IMPORT_QUEUE`, `EXPORT_QUEUE`, `CAMPAIGN_QUEUE`, `IMPORT_DL_QUEUE`, `EXPORT_DL_QUEUE`, `CAMPAIGN_DL_QUEUE` |
| Queue consumers | email, sms, push, wp-provision, import (DLQ), export (DLQ), campaign (DLQ) |
| Durable Object | `REALTIME` → `RealtimeRoom` (migration `v1`) |
| Workers AI | `AI` |
| Cron | `*/5 * * * *` |
| Vars / routes | none |

**Mismatches with `backend/src/types.ts` (`Env`, lines 4-61)**
- **In `Env` and used in code, but not in `wrangler.toml` or Terraform:** `AI_EXTRACTION_QUEUE`, `AI_EXTRACTION_DLQ` (`queues/ai-extraction-queue.ts:64,141,202`) and `NOTIFICATION_QUEUE` (`services/missed-call-handler.ts:52`).
- **In `wrangler.toml` but not in `Env`:** the three `*_DL_QUEUE` producers.
- **Read in code but not in `Env`:** `SUPER_ADMIN_EMAIL` (`middleware/require-super-admin.ts:23`) and `ENVIRONMENT` (`index.ts:142`).

### Backend secrets

| Variable | Service | Used in code | Pushed by `push-secrets.sh` | Set locally |
|---|---|---|---|---|
| `JWT_SECRET` | App auth | yes | yes | dev value only |
| `JWT_REFRESH_SECRET` | App auth | no (only declared, `types.ts:36`) | yes | dev value only |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio | yes | yes | no (fakes) |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify (OTP) | yes | yes | no (fake) |
| `TWILIO_SMS_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM_NUMBER` | Twilio | yes | yes | no |
| `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_SMS_FROM_NUMBER`, `PLIVO_WHATSAPP_FROM_NUMBER` | Plivo (optional) | yes | yes | no |
| `SENDGRID_API_KEY` | SendGrid | yes | yes | no (fake) |
| `SENDGRID_FROM_EMAIL` | SendGrid | no (sender is hardcoded) | yes | dev value |
| `FCM_SERVER_KEY` | Firebase push | yes (`services/fcm.ts:22`) | yes | no (fake) |
| `DEEPGRAM_API_KEY` | Deepgram transcription | yes | yes | no |
| `ANTHROPIC_API_KEY` | Anthropic | yes (`services/ai-extraction.ts:112`) | yes | no |
| `GOOGLE_MAPS_API_KEY` | Google Maps | yes (`routes/fleet.ts:2075`) | yes | no |
| `INBOUND_EMAIL_SECRET` | SendGrid Inbound Parse | yes (`routes/inbound.ts:198`) | no | no |
| `SUPER_ADMIN_EMAIL` | App bootstrap | yes | no | no |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare API | declared only | yes | no |
| `APP_URL` | App | no (zero references in `backend/src`) | yes | dev value |
| `TEST_MODE` | Test reset and fixed OTP | yes | must never be set in production | yes |

`desktop/.env.example` also lists `SENDGRID_FROM_NAME`, `SENDGRID_UNSUBSCRIBE_GROUP_ID`, `UNSUB_SECRET`, `R2_PUBLIC_URL`, `FLEET_BUCKET`, `R2_BUCKET`, `MESSAGING_QUEUE` and `KV`; none of them is referenced in `backend/src`. The root `.env.example` covers only six backend secrets and is out of date.

`FCM_SERVER_KEY` is used with an `Authorization: key=` header, which is Firebase's legacy HTTP API. Google has shut that API down as far as I know; please verify before relying on push.

### Other apps

| App | Variable | Service | Where it is read | Set locally |
|---|---|---|---|---|
| desktop | `NEXT_PUBLIC_API_URL` | Backend API | `desktop/src/lib/api/config.ts:1` | no |
| desktop | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps | `desktop/src/components/ui/address-autocomplete.tsx:134` | yes |
| super-admin | `JWT_SECRET` | Admin sessions | `src/middleware.ts:4` and 2 others | no (falls back to a hardcoded default) |
| super-admin | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Seed admin | `src/app/api/auth/seed/route.ts:12-13` | no (defaults in tracked `wrangler.toml`) |
| super-admin | `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare D1 API | `src/app/api/tenants/provision/route.ts:78-79` | no |
| super-admin | `RAZORPAY_WEBHOOK_SECRET` | Razorpay | `src/app/api/webhooks/razorpay/route.ts:11` | no |
| crm_app | `API_BASE_URL`, `ENVIRONMENT`, `GOOGLE_PLACES_API_KEY` | `--dart-define` | `lib/core/constants/app_config.dart` | not applicable |
| driver_app | `API_BASE_URL`, `ENVIRONMENT`, `TENANT_ID` | `--dart-define` | `lib/core/constants/app_config.dart` | not applicable |
| oci-provisioner | `PROVISIONER_SECRET`, `DATA_DIR`, `MAX_SITES`, `PORT` | WordPress host | `oci-provisioner/src/server.ts:11-13` | no |
| Terraform / CI | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, vars `API_BASE_URL`, `DOMAIN` | GitHub Actions | workflows | unknown (GitHub side) |

Razorpay appears only in the super-admin webhook; there is no key id or secret and no checkout code anywhere. There is no Stripe.

## 5. Existing docs

| File | Summary | Current? |
|---|---|---|
| `README.md` (31 KB, 2026-10-02) | Architecture diagram, tech stack, repo layout, quick start, deploy, config, Terraform resources, CI table, cost and pricing model | Mostly current; stale on `deploy:web`, `build:web`, `build:windows` and on `.dev.vars` handling |
| `CONTRIBUTING.md` (41 KB, 2026-02-27) | Guide to adding a feature across backend, shared and Flutter | Stale: Flutter-first, predates the desktop app |
| `PRD-AUDIT-REPORT.md` | PRD vs implementation audit, March | Stale |
| `INTERNATIONAL-FEATURES-SHEET.md` | International feature wishlist, February | Stale, not a status document |
| `docs/archive/*` (9 md, 3 xlsx) | Milestone 7 documents, M2 audit, E2E reports | Archived |
| `desktop/audit/FINAL-REPORT.md` | March audit summary ("~96% complete") | Stale, superseded |
| `desktop/audit/M6…M18-audit.md`, `IMPLEMENTATION-PLAN.md`, `IMPROVEMENTS.md` | March milestone audits and fix plans | Stale |
| `desktop/audit/fix/FINAL-E2E.md` (2026-10-07) | Three consecutive clean E2E runs (766 passed, 38 skipped) and gate results | Current; the best quality evidence |
| `desktop/audit/fix/BUGS.md`, `FIX-PLAN.md` (2026-10-03) | 87-bug inventory and 32-batch plan | Historical record of the fix round |
| `desktop/audit/remake/UI-REMAKE-COVERAGE.md` (2026-10-02) | Endpoint coverage by slice: 562 endpoints, 228 wired, 41% | Fairly current |
| `desktop/audit/remake/FEATURE-GAP-ANALYSIS.md` (2026-08-07) | Backend endpoints with no UI | Partly outdated by later work |
| `desktop/audit/remake/CONTRACT.md` | Desktop design-system contract | Current |
| `desktop/showcase/SHOWCASE.md`, `README-RECORDING.md`, `STORYBOARD.md`, `DRIVER-EMULATOR-NOTES.md` | Demo video outputs, how to record, storyboard, emulator recipe | Current (2026-10-03 to 10-08) |
| `scripts/PIPELINE-GUIDE.md`, `scripts/REMAKE-GUIDE.md` | Operator guides for the agent pipelines | Internal tooling, not product |
| `desktop/src/lib/api/USAGE.md` | API client usage, March | Possibly stale |
| `desktop/README_FLEET_MODULE.md`, `FLEET_*.md` | Mock-data fleet module, March | Stale |
| `e2e/README.md`, `QUICKSTART.md`, `IMPLEMENTATION_SUMMARY.md` | Old root E2E suite | Stale |
| `backend/MILESTONE_10_IMPLEMENTATION.md` | Push notification milestone, February | Stale |
| `.claude/plan/cloudflare-do-websocket.md` | Plan for realtime over Durable Objects | Historical |
| `super-admin/README.md`, `packages/crm_app/README.md`, `packages/driver_app/README.md`, `packages/shared/README.md` | Framework templates | Placeholder |
| `terraform/**/*.md` | None exist | — |

**The four you asked about**
- **Feature list:** no current one. The closest are `product-requirment/03-TRAVEL-CRM-FEATURE-LIST.md` (untracked, March), the 47-chapter list in `desktop/showcase/chapters.txt`, and `UI-REMAKE-COVERAGE.md`.
- **Infra / architecture:** only the `README.md` sections "Architecture" and "Infrastructure". There is no standalone document.
- **Deployment / runbook:** only `README.md` "Deploy (Production)", which is partly wrong. No runbook, rollback or incident document.
- **Go-live checklist:** none.

## 6. Demo video tooling

**How recording works**
- `desktop/playwright.showcase.config.ts` runs specs in `desktop/e2e/showcase/` against an already running production build (`node desktop/scripts/fix-stack.mjs up --slot N`).
- Settings: 1920×1080, Playwright video always on, one worker, no retries, light theme, `Asia/Kolkata`.
- `scripts/record-demo.mjs` orchestrates the stages `preflight → seed → storyA → driver → storyB → walkthrough → smoke → compose → finalize`. It is resumable with `--from` / `--only`, and enforces an 08:00-20:30 IST window unless `SHOWCASE_IGNORE_WINDOW=1`.
- `scripts/record-driver.ps1` runs `packages/driver_app/integration_test/demo_flow_test.dart` on Android emulator `emulator-5554` (AVD `Resizable_Experimental`) and captures it with `adb shell screenrecord` (180 s cap).
- Data comes from `backend/scripts/seed-demo.mjs` and `desktop/e2e/showcase/demo-seed.ts` / `demo-data.ts`: demo company "Sahyadri Holidays" with six staff.

**How composition works**
- `scripts/showcase/compose.mjs` uses ffmpeg (located by `scripts/showcase/ffmpeg.mjs` via the `FFMPEG` env var, `ffmpeg-static`, or PATH).
- It normalises to H.264 30 fps, joins with the concat demuxer, composites the phone clip inside a device frame next to a still desktop frame, and adds a silent AAC track (`anullsrc`, line 56).
- `scripts/showcase/cards.mjs` renders intro, outro and scene cards from HTML to PNG.
- `desktop/e2e/showcase/finalize.ts` is the quality gate: banned strings, console and HTTP errors, durations, chapter lengths, white/black flashes. It also writes the chapter files.

**What exists today for narration and graphics**
- **Voice-over / TTS:** none. The audio track is silence.
- **Subtitle files (SRT/VTT):** none.
- **Captions:** burned in. They are lower-third text injected into the page during recording by `say()` (`showcase-helpers.ts:75`, `cursor-overlay.ts:25-33`), plus chapter cards (`walkthrough-kit.ts:17`) and a fake cursor with click ripple.
- **Reusable caption timing:** each take writes `marks-*.json` with caption text and timestamps, which could drive TTS or subtitles later.
- **Intro/outro:** static PNG cards with a fade (`compose.mjs:40-41`, `cards.mjs:31,37`).
- **Motion graphics, music, zoom/pan:** none.

**Current outputs** (in `desktop/showcase/`, untracked)

| Video | Length | Size | Recorded |
|---|---|---|---|
| `TravelCRM-Demo.mp4` (story cut) | 10:20 | 59 MB | 2026-10-07 |
| `TravelCRM-Full-Walkthrough.mp4` (47 chapters) | 29:53 | 177 MB | 2026-10-07/08 |
| `TravelCRM-Assistant.mp4` | 3:22 | 33 MB | 2026-10-08 |

`.work/` holds about 170 MB of intermediates.

**Coverage**
- **Roles:** every desktop take logs in as the single admin user (Ananya Menon, `demo-data.ts:150`; `showcase-fixtures.ts:20`). The driver appears through the driver app. The other five roles (`sales_manager`, `salesperson`, `operations`, `accountant`, `view_only`) are seeded as staff but never logged in on camera.
- **Plans:** one tenant on one plan with every feature un-gated (`demo-seed.ts:428`). No plan comparison or gated or upgrade state is shown. `FINAL-E2E.md` notes that `ai_chatbot` and `ai_intelligence` are gated off on the pro plan the E2E stack uses.
- **Super-admin:** only the desktop app's in-app `/super-admin`, `/super-admin/tenants` and `/super-admin/plans` pages, for about 16 seconds (chapter 44, `wt7.spec.ts:132-142`). The standalone `super-admin/` Next.js app is not recorded.
- **Landing page:** not covered.
- **crm_app (Flutter CRM):** not covered.

## Things that look broken or missing for a production release

**Security**
1. A GitHub token is embedded in the git remote URL in `.git/config`.
2. Tracked default super-admin credentials and placeholder JWT secret, with code fallbacks, in `super-admin/wrangler.toml:15-21` and the four files listed in section 0.
3. `super-admin/src/app/api/auth/seed/route.ts` is publicly reachable; the Razorpay webhook accepts unsigned requests when its secret is unset.
4. `backend/.dev.vars` is in git history (values look fake).

**Backend**
5. `backend/wrangler.toml` has placeholder resource ids, no vars, no routes or custom domain, and (as you already have) named environments that set only `name`.
6. Three queues used in code are not bound or provisioned: `AI_EXTRACTION_QUEUE`, `AI_EXTRACTION_DLQ`, `NOTIFICATION_QUEUE`.
7. Master migrations in `backend/drizzle/master/` have no apply path; `migrations_dir` points at tenant migrations.
8. No per-tenant database binding exists, so every tenant falls back to `MASTER_DB` (`services/tenant-db.ts:50`).
9. CORS blocks any custom domain (`index.ts:130-146`).
10. App URLs and sender address are hardcoded to `travelcrm.pro`; `APP_URL` and `SENDGRID_FROM_EMAIL` are pushed as secrets but never read.
11. `backend/package-lock.json` is out of sync with `package.json`.
12. Push notifications depend on a legacy FCM key and neither Flutter app has a push package.

**Desktop**
13. The packaged Electron app has no way to serve the Next app (`electron/main.ts:40-46`).
14. `desktop/public/` and all three icons are missing; the tray icon is empty.
15. No code signing, no auto-update, and `publish.owner` is `your-org`.
16. No production `NEXT_PUBLIC_API_URL` is configured anywhere.
17. `deploy:desktop` uploads a raw `.next` folder to a Pages project that Terraform does not create.

**Super-admin**
18. Code uses OpenNext; config, CI and Terraform use next-on-pages. Neither path is complete.
19. `R2_BUCKET` → `travelcrm-assets` is not provisioned.
20. Plan names disagree across super-admin, backend and landing.

**Landing**
21. `landing/main.js` is gitignored.
22. Every CTA is `href="#"`; there is no signup, contact or demo form and no backend signup endpoint.
23. Legal pages, `og-image.png`, favicon and `sitemap.xml` are missing; social proof and ratings are unverified; the phone number looks like a placeholder.
24. No deploy path exists for the landing page.

**Mobile**
25. Both Android apps sign releases with the debug key and have no keystore.
26. `crm_app` has template names everywhere, no `INTERNET` permission in its main manifest, default icons and mock recipients in `bulk_send_screen.dart`.
27. `driver_app` bakes one tenant id into the build, lacks iOS location and camera usage strings, compares against `'prod'` instead of `'production'`, and has no CI.
28. The MSIX config points at a missing icon and a missing package.
29. `pubspec.lock` is not in git; there is no store metadata.

**CI/CD and infrastructure**
30. All workflows trigger on `main` while the repo uses `master`.
31. `test.yml` and `release.yml` pin Flutter 3.24.x against a Dart 3.11 requirement.
32. `terraform/environments/*.tfvars` are untracked but required by `terraform.yml`; the state bucket and endpoint must be set up by hand.
33. Terraform DNS records use the placeholder IP `192.0.2.1` and no custom-domain resources exist (`modules/cloudflare/main.tf:15,33,42`).
34. The backend deploy health check cannot fail.

**Repo hygiene and docs**
35. About 230 MB of recordings, 23 backend logs, scratch files, a lock file and a dangling gitlink are tracked.
36. 237 commits and about 60 modified files exist only on this machine.
37. There is no go-live checklist, runbook, standalone architecture document or current feature list.
38. The demo videos are silent, cover one role and one plan, and do not cover the standalone super-admin app, the landing page or the Flutter CRM app.
