# Build verification (2026-10-21)

Every deliverable was built from the `launch-readiness` branch (HEAD `8ce8bb7` plus uncommitted video-studio files that no build touches) on the owner's Windows 11 PC, then smoke-tested where a test exists. Nothing was deployed, signed or uploaded. Builds wrote only to git-ignored folders. No source file was changed to make any build pass.

Result: all 8 items passed.

## Artifacts

| Artifact | Command | Result | Size | SHA-256 | Smoke test |
|---|---|---|---|---|---|
| API Worker (checks) | `cd backend && npx tsc --noEmit`; `npx vitest run`; `node scripts/gen-wrangler.selftest.mjs` | tsc clean (12 s); 2074 of 2074 tests passed (about 100 s); self-test ALL PASSED | n/a | n/a | n/a |
| API Worker (bundle) | production-shaped config with `DOMAIN=example.test` and made-up ids, then `npx wrangler deploy --dry-run -c .wrangler.verify.toml --env production --outdir <tmp>` | exit 0 (2 s). Nothing uploaded. The temporary config was deleted afterwards | 7000.83 KiB total, 1408.55 KiB gzipped. Workers limit is 10 MB gzipped on the paid plan (3 MB on free), so about 14% of the limit | `index.js` `b22c4aaf2b30cd1f733077dedda7b50eb18b9e3970ed00bae473dcb9bd7b2c98` | The generated config lists every binding and the derived URLs (`https://app.example.test`, `https://api.example.test`) |
| Windows installer (NSIS, unsigned) | `TRAVELCRM_UPDATE_URL=http://127.0.0.1:19999/feed/ npm -w travelcrm-desktop run build:desktop` | exit 0 (113 s). Signing skipped, as expected | `desktop/release/TravelCRM Pro Setup 0.1.0.exe`, 167,871,770 bytes (160.1 MiB) | `5eedc049e1b8e82e0c3a1e6d7282644f1d903c86aa2fb7e3891a691a80c88265` | Existing Playwright Electron smoke (`desktop/e2e-electron/smoke.spec.ts`) against a slot 0 local stack: 3 of 3 passed (26 s). It silently installed to a temp folder, launched the app, saw the bundled Next server answer and the login page ("Welcome back") render, signed in and reached the dashboard, and confirmed the server port closes on exit. It also confirmed the updater reads the feed baked into `build-config.json` (`updater enabled (feed=build-config:http://127.0.0.1:19999/feed/)`) and reports `update-available` from a local feed. The test uninstalled and removed its temp folder; no TravelCRM process or `travelcrm-smoke-*` folder was left |
| Agency web app (OpenNext) | `npm -w travelcrm-desktop run build:web`, then `cd desktop && npx wrangler deploy --dry-run --outdir <tmp>` | build exit 0 (59 s); dry-run exit 0 (3 s). Nothing uploaded | 9501.40 KiB total (worker 8.26 MB plus two wasm files), 1436.21 KiB gzipped, 279 static asset files | `worker.js` `7b264bd3293ba43190cfed2fb17f8673259fe081ca233969d417d0b50868bb5a` | Bundling and bindings accepted by wrangler. No browser run of the web build |
| Super admin console | `cd super-admin && npx tsc --noEmit`; `npm run lint`; `npm run build`; `npx opennextjs-cloudflare build`; `npx wrangler deploy --dry-run --outdir <tmp>` | tsc clean; lint 0 errors, 2 warnings (unused `FileText` import and unused `warnings` variable in `src/app/(authenticated)/seo/page.tsx`); next build ok (all 20 routes); OpenNext build ok (27 s); dry-run ok | 5646.74 KiB total, 1380.66 KiB gzipped | `worker.js` `b1419af5902a7da16f119dd34b09f18fbc9fc1d05161ff4cc879f09e4bfc0b0a` | Compiles and bundles. Not started in a browser |
| Landing page | `node landing/scripts/build.mjs`; `node landing/scripts/check-links.mjs` | both exit 0. Build warns that the domain is still the placeholder `YOUR-DOMAIN.example` (expected until phase 0). Link check: 63 references on 5 pages, no broken internal links, no dead "#" buttons (6 external links not fetched) | `landing/dist`, 21 files, about 3.9 MB | not hashed (a folder) | Link check is the smoke test |
| Driver app, Android APK (release) | x86 PowerShell: `flutter analyze` and `flutter test` in `packages/shared` and `packages/driver_app`, then `flutter build apk --release` with a temporary `android/key.properties` pointing at the throwaway key | shared: analyze clean, 88 tests passed. driver_app: analyze clean, 114 tests passed. APK build exit 0 (95 s). `key.properties` deleted afterwards | `packages/driver_app/build/app/outputs/flutter-apk/app-release.apk`, 56,150,310 bytes (53.5 MB) | `88cef42d9122154c45df7817acdf285df9412518a271ccaffc16d52f5d2424a5` | `apksigner verify` shows it is signed by the throwaway key ("THROWAWAY R115 test key, NOT A REAL KEY"), so it must never go to Google Play. **Not installed or launched: no Android emulator or phone is available on this PC** (`flutter emulators` lists none; `flutter devices` shows only Windows and Chrome) |
| OCI provisioner | `cd oci-provisioner && node --test "test/*.test.mjs"`; `npx tsc --noEmit` | 0 failures; tsc clean | n/a | n/a | n/a |
| Terraform | `terraform -chdir=terraform init -backend=false -no-color`, `validate -no-color`; the same for `terraform/oracle`; `terraform fmt -check -recursive terraform` | all exit 0. Terraform v1.14.5. Both configurations "valid"; formatting clean | n/a | n/a | `init -backend=false` created only the git-ignored `.terraform` folders |

## Findings worth knowing

- **Driver demo video test:** `packages/driver_app/integration_test/demo_flow_test.dart` now calls `agency.chooseAgency(tester)` after `app.main()` (fixed after this verification, commit "driver demo flow test chooses the agency first"); `flutter analyze integration_test` is clean. It needs a device or emulator to run.
- **Stray packages:** none. After the web build, the super admin OpenNext build and the desktop installer build, `desktop/node_modules` holds only `date-fns` and `vitest` and `super-admin/node_modules` holds only `@cloudflare/workers-types` and `@types/node`, all listed in `package-lock.json`. The only unlisted entry is `desktop/node_modules/.vite`, which is a cache folder and not a package; it was left alone. Nothing was removed.
- **Build order matters on the desktop:** `build:web` writes to `desktop/.next`, the same folder the Electron build uses. The installer in `desktop/release` was built first and is not affected, but run `build:desktop` again before the next installer.
- **Local stack:** one stack was started on slot 0 (`--reset-db --no-build`, no `--ai`) for the installer smoke test, then brought down. This reset the local development database in `backend/.wrangler/state`.
- **Lint warnings:** the two super admin warnings above are harmless but easy to clean up.

## What was NOT verified here

| Not verified | Why |
|---|---|
| macOS DMG | Needs a Mac. The `mac` target in `desktop/electron-builder.yml` was not built. |
| iOS driver app | Needs a Mac and Xcode. |
| Code signing (Windows installer, Android upload key, macOS notarisation) | No real certificates or upload key exist yet. The installer is unsigned (Windows SmartScreen will warn) and the APK is signed with a throwaway key. |
| Play Store upload | Needs the real upload key and a Play Console account. |
| Real deploys (API Worker, web app, super admin, Terraform apply, update feed) | Forbidden on this PC, which is signed in to the owner's real Cloudflare account. Only `wrangler deploy --dry-run` was used; it bundles locally and uploads nothing. Run `docs/GO-LIVE.md` for the real thing. |
| Production-id config | The API bundle was built from made-up ids and the domain `example.test`. The real ids come from Terraform output at go-live. |
| Auto-update end to end | Checked against a local feed only, not a real `downloads.<domain>` feed. The installer was built with a local feed address, so rebuild with `DOMAIN` set before shipping. |
| APK on a device | No emulator or phone. Only signing and compile-level checks ran. |
| Web builds in a browser | The agency web app and the super admin console were bundled and accepted by wrangler, not browsed. |
| Terraform plan or apply, remote state | `init -backend=false` and `validate` do not talk to Cloudflare or Oracle. |

## Reproduce

Run from the repository root in Git Bash. Nothing here deploys. Flutter commands must go through the x86 PowerShell.

```bash
# 1. API Worker
cd backend
npx tsc --noEmit
npx vitest run                              # expect 2074 passed
node scripts/gen-wrangler.selftest.mjs
echo '[]' > "$TEMP/reg.json"
DOMAIN=example.test CF_D1_MASTER_ID=11111111-1111-4111-8111-111111111111 \
  CF_KV_CACHE_ID=22222222222222222222222222222222 CF_KV_SESSIONS_ID=33333333333333333333333333333333 \
  CF_KV_REPORT_CACHE_ID=44444444444444444444444444444444 \
  node scripts/gen-wrangler.mjs --env production --registry "$TEMP/reg.json" --out .wrangler.verify.toml
npx wrangler deploy --dry-run -c .wrangler.verify.toml --env production --outdir "$TEMP/bw"   # must say --dry-run
rm .wrangler.verify.toml
cd ..

# 2. Windows installer and smoke test (the smoke test needs a local stack)
TRAVELCRM_UPDATE_URL=http://127.0.0.1:19999/feed/ npm -w travelcrm-desktop run build:desktop
node desktop/scripts/fix-stack.mjs up --slot 0 --reset-db --no-build
(cd desktop && E2E_API_URL=http://localhost:8787/api/v1 E2E_EXPECT_FEED=http://127.0.0.1:19999/feed/ \
  npx playwright test -c playwright.electron.config.ts)
node desktop/scripts/fix-stack.mjs down --slot 0

# 3. Agency web app
npm -w travelcrm-desktop run build:web
(cd desktop && npx wrangler deploy --dry-run --outdir "$TEMP/ww")

# 4. Super admin console
cd super-admin && npx tsc --noEmit && npm run lint && npm run build
npx opennextjs-cloudflare build && npx wrangler deploy --dry-run --outdir "$TEMP/sw"
cd ..

# 5. Landing page
node landing/scripts/build.mjs && node landing/scripts/check-links.mjs

# 7. Provisioner
(cd oci-provisioner && node --test "test/*.test.mjs" && npx tsc --noEmit)

# 8. Terraform
terraform -chdir=terraform init -backend=false -no-color
terraform -chdir=terraform validate -no-color
terraform -chdir=terraform/oracle init -backend=false -no-color
terraform -chdir=terraform/oracle validate -no-color
terraform fmt -check -recursive terraform
```

Driver app (6). Write `packages/driver_app/android/key.properties` (git-ignored) with the four lines `storeFile`, `storePassword`, `keyAlias`, `keyPassword` as in `key.properties.example`, pointing at the throwaway key in `CRM-backups/throwaway-keystore/` (see its README), build, then delete the file:

```bash
F="C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe"
for d in shared driver_app; do
  "$F" -Command "cd C:/Users/Admin/Downloads/pro/CRM/packages/$d; flutter analyze; flutter test"
done
"$F" -Command "cd C:/Users/Admin/Downloads/pro/CRM/packages/driver_app; flutter build apk --release"
rm packages/driver_app/android/key.properties
```

After any OpenNext build, check that `desktop/node_modules` and `super-admin/node_modules` hold only packages listed in the root `package-lock.json` under `desktop/node_modules/...` and `super-admin/node_modules/...`.
