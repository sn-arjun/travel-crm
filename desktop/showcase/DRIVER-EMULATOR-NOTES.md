# Driver app on the Android emulator — proven recipe (B13, 2026-10-03)

Proven end to end by B13 (screenshots: `desktop/audit/fix/shots/driver-after-*.png`):
OTP login → Today list → detail → Accept → En route → GPS check-in (9.9312, 76.2673) → Started → Complete → History.
API timeline: assigned → accepted → en_route → check_in → started → completed.

## Stack
- Backend: `cd desktop && node scripts/fix-stack.mjs up --slot 3 --reset-db` (API http://localhost:8817, TEST_MODE → driver OTP `123456`). A fresh worktree needs a full build (no `--no-build`).
- Seed: `API_URL=http://localhost:8817/api/v1 node packages/driver_app/tool/seed_smoke.mjs` (driver +919876543210 "Ravi Kumar", vehicle KA 05 MN 4521, trip assigned to him). Pickup lands in "Today" only if it is before tenant (IST) midnight; the seed moves it to now+2min near midnight.

## Emulator
- Boot (PowerShell): `Start-Process emulator.exe -ArgumentList '-avd Resizable_Experimental -no-snapshot-save -no-boot-anim'`, then `adb wait-for-device` and poll `adb shell getprop sys.boot_completed` until `1`.
- `adb reverse tcp:8787 tcp:8817` (app default API_BASE_URL is http://localhost:8787 and default TENANT_ID is the demo tenant).
- `adb shell cmd location set-location-enabled true`; `adb emu geo fix 76.2673 9.9312` (lon lat).
- First check-in may show Google Play "Location Accuracy" dialog → tap "Turn on" (or enable location first).
- Dark mode: `adb shell cmd uimode night yes` (the `settings put secure ui_night_mode` route does not work).
- Screencap needs the display id: `adb exec-out screencap -d 4619827259835644672 -p > x.png` (without it a "Multiple displays" warning corrupts the PNG). Same applies to `screenrecord --display-id`.

## Scripted run (x86 PowerShell for flutter)
`flutter test integration_test/smoke_login_test.dart -d emulator-5554 --dart-define=API_BASE_URL=http://localhost:8787 --dart-define=DRIVER_PHONE=9876543210 --dart-define=OTP=123456 --dart-define=TRIP_ID=<id>`

## Manual/installed run
`flutter build apk --debug` → `adb install -r build/app/outputs/flutter-apk/app-debug.apk` → `adb shell pm grant <pkg> android.permission.ACCESS_FINE_LOCATION` (and COARSE).

## App behaviour to script around
- OTP needs an explicit Verify tap (no auto-submit).
- No `in_progress` status: check-in screen posts check-in, then sets status `started`; `started` shows `action-complete`.
- Keys: D.6 list + `status-chip-<status>`, `call-passenger`, `open-maps-pickup|drop`, `trip-timeline`, `trip-action-bar`, `trips-empty-<tab>`, `trips-error-<tab>`, `nav-trips`, `nav-profile`.
