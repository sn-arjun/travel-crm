// Scripted, human-paced driver flow for the client demo video (STORYBOARD scene 7 / D.6).
//
// Not a regression test: it exists to be screen-recorded (scripts/record-driver.ps1 starts
// `adb shell screenrecord` when this prints `DEMO_MARK ready`). Flow:
//   login (+91 98765 43210, OTP, explicit Verify tap) -> Today -> trip detail -> Accept -> En route
//   -> Check-in (GPS visible) -> Started -> Complete -> History.
//
// Needs a TEST_MODE backend (OTP 123456) and the demo seed's "today" trip:
//   node backend/scripts/seed-demo.mjs --live-trip      (writes desktop/showcase/.handoff.json)
//
//   flutter test integration_test/demo_flow_test.dart -d emulator-5554 \
//     --dart-define=API_BASE_URL=http://localhost:8787 \
//     --dart-define=TENANT_ID=01960000-0000-7000-8000-000000000001 \
//     --dart-define=TRIP_ID=<id> --dart-define=DRIVER_PHONE=9876543210 --dart-define=OTP=123456
//
// Marks (stdout, one per line, `@<ms since ready>`):
//   DEMO_MARK ready | CAPTION <text> | CARD <text> | GEO <lng> <lat> | done
import 'package:driver_app/main.dart' as app;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';

const _phone = String.fromEnvironment('DRIVER_PHONE', defaultValue: '9876543210');
const _otp = String.fromEnvironment('OTP', defaultValue: '123456');
const _tripId = String.fromEnvironment('TRIP_ID');
// Pace multiplier in percent (100 = storyboard pacing). Lower it if the clip runs past the budget.
const _pace = int.fromEnvironment('PACE_PERCENT', defaultValue: 100);

final Stopwatch _clock = Stopwatch();

void _mark(String line) {
  // ignore: avoid_print
  print('DEMO_MARK $line @${_clock.elapsedMilliseconds}');
}

/// Pumps real frames for [ms] (keeps the app rendering, unlike sleep).
Future<void> dwell(WidgetTester tester, int ms) async {
  final end = DateTime.now().add(Duration(milliseconds: (ms * _pace / 100).round()));
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Pumps until [finder] matches (skeleton loaders animate forever, so pumpAndSettle is unusable).
Future<void> pumpUntil(WidgetTester tester, Finder finder,
    {Duration timeout = const Duration(seconds: 40)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}

/// Snackbars float over the bottom action bar and swallow taps; wait until they are gone.
Future<void> waitSnackGone(WidgetTester tester) async {
  final end = DateTime.now().add(const Duration(seconds: 10));
  while (DateTime.now().isBefore(end) && find.byType(SnackBar).evaluate().isNotEmpty) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.pump(const Duration(milliseconds: 300));
}

/// Visible touch indicator + tap. Synthetic taps do not trigger Android `show_touches`,
/// so draw our own: a 44 px indigo circle that grows and fades over 450 ms.
Future<void> showTouch(WidgetTester tester, Finder finder) async {
  final target = finder.first;
  final c = tester.getCenter(target);
  final overlay = tester.state<OverlayState>(find.byType(Overlay).first);
  final t = ValueNotifier<double>(0);
  final entry = OverlayEntry(
    builder: (_) => Positioned(
      left: c.dx - 22,
      top: c.dy - 22,
      child: IgnorePointer(
        child: ValueListenableBuilder<double>(
          valueListenable: t,
          builder: (_, p, _) => Opacity(
            opacity: (1 - p).clamp(0.0, 1.0),
            child: Transform.scale(
              scale: 0.6 + 0.8 * p,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0x4D4F46E5),
                  border: Border.all(color: const Color(0xFF4F46E5), width: 2),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  overlay.insert(entry);
  // The ring is visible for ~150 ms before the tap lands, then keeps expanding.
  await _animate(tester, t, 0.0, 0.3, 150);
  await tester.tap(target);
  await _animate(tester, t, 0.3, 1.0, 300);
  entry.remove();
  t.dispose();
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _animate(WidgetTester tester, ValueNotifier<double> t, double from, double to, int ms) async {
  final sw = Stopwatch()..start();
  while (sw.elapsedMilliseconds < ms) {
    t.value = from + (to - from) * (sw.elapsedMilliseconds / ms);
    await tester.pump(const Duration(milliseconds: 16));
  }
  t.value = to;
}

/// Visible typing: growing substrings, [msPerChar] apart.
Future<void> typeHuman(WidgetTester tester, Finder finder, String text, int msPerChar) async {
  for (var i = 1; i <= text.length; i++) {
    await tester.enterText(finder, text.substring(0, i));
    await dwell(tester, msPerChar);
  }
}

/// Slow drag-scroll in 4 steps of 400 ms.
Future<void> slowScroll(WidgetTester tester, double dy) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 4; i++) {
    await tester.drag(scrollable, Offset(0, dy / 4));
    await dwell(tester, 400);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('demo: Ravi drives the airport pickup from login to history', (tester) async {
    // Start from a signed-out device so the app opens on the login screen.
    await Hive.initFlutter();
    await Hive.deleteFromDisk();

    app.main();
    await pumpUntil(tester, find.byKey(const Key('phone-field')));

    // ── ready: the script starts screenrecord now ──
    _clock.start();
    _mark('ready');
    await dwell(tester, 4000);

    // 7.1 login
    _mark('CAPTION Ravi signs in with his mobile number and a one-time code');
    await dwell(tester, 2000);
    await showTouch(tester, find.byKey(const Key('phone-field')));
    await typeHuman(tester, find.byKey(const Key('phone-field')), _phone, 140);
    await dwell(tester, 700);
    await showTouch(tester, find.byKey(const Key('send-otp')));

    // 7.2 OTP (explicit Verify tap: the app does not auto-submit)
    await pumpUntil(tester, find.byKey(const Key('verify-otp')));
    await dwell(tester, 1200);
    for (var i = 0; i < _otp.length && i < 6; i++) {
      await tester.enterText(find.byKey(Key('otp-$i')), _otp[i]);
      await dwell(tester, 220);
    }
    await dwell(tester, 700);
    await showTouch(tester, find.byKey(const Key('verify-otp')));

    // 7.3 Today list
    await pumpUntil(tester, find.byKey(const Key('tab-today')));
    final card = _tripId.isEmpty
        ? find.byWidgetPredicate((w) =>
            w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('trip-card-'))
        : find.byKey(const Key('trip-card-$_tripId'));
    await pumpUntil(tester, card);
    _mark("CAPTION Today's jobs are waiting the moment he logs in");
    await dwell(tester, 2500);
    await showTouch(tester, find.byKey(const Key('tab-upcoming')));
    await dwell(tester, 1500);
    await showTouch(tester, find.byKey(const Key('tab-today')));
    await pumpUntil(tester, card);
    await dwell(tester, 800);
    await showTouch(tester, card);

    // 7.4 Trip detail
    await pumpUntil(tester, find.byKey(const Key('action-accept')));
    _mark('CAPTION Pickup, flight notes and one-tap navigation');
    await dwell(tester, 1800);
    await slowScroll(tester, -420);
    // the passenger number is shown as stored (the desktop trip form keeps national digits only)
    expect(find.byKey(const Key('passenger-phone'), skipOffstage: false), findsWidgets);
    await dwell(tester, 900);
    await slowScroll(tester, 420);
    await dwell(tester, 600);

    // 7.5 Accept
    _mark('CAPTION One tap to accept - the office sees it instantly');
    await showTouch(tester, find.byKey(const Key('action-accept')));
    await pumpUntil(tester, find.byKey(const Key('confirm-accept')));
    await dwell(tester, 900);
    await showTouch(tester, find.byKey(const Key('confirm-accept')));
    await pumpUntil(tester, find.byKey(const Key('action-en-route')));
    await dwell(tester, 2200);

    // 7.6 En route
    _mark('CAPTION Live status updates flow back to dispatch');
    await waitSnackGone(tester);
    await showTouch(tester, find.byKey(const Key('action-en-route')));
    await pumpUntil(tester, find.byKey(const Key('action-check-in')));
    await dwell(tester, 2200);

    // 7.7 GPS check-in
    _mark('CAPTION GPS-verified check-in on arrival');
    await waitSnackGone(tester);
    await showTouch(tester, find.byKey(const Key('action-check-in')));
    // the emulator only delivers a fix while the app is listening: re-send it now (host script reacts to GEO)
    _mark('GEO 76.4019 10.1520');
    await dwell(tester, 2000);
    _mark('GEO 76.4019 10.1520');
    await pumpUntil(tester, find.byKey(const Key('check-in-coords')));
    await dwell(tester, 2600);
    await showTouch(tester, find.byKey(const Key('confirm-check-in')));
    await pumpUntil(tester, find.byKey(const Key('action-complete')));
    await dwell(tester, 2200);

    // 7.8 time-skip card (composited over the phone; the script also moves the emulator to the drop point)
    _mark('GEO 76.4285 9.6177');
    _mark('CARD Two hours later - Kumarakom');
    await dwell(tester, 2800);

    // 7.9 Complete -> History
    _mark('CAPTION Trip complete - car and driver free for the next job');
    await waitSnackGone(tester);
    await showTouch(tester, find.byKey(const Key('action-complete')));
    await dwell(tester, 3000);
    await showTouch(tester, find.byKey(const Key('nav-history')));
    await dwell(tester, 2600);

    _mark('done');
    await dwell(tester, 2000);
  });
}
