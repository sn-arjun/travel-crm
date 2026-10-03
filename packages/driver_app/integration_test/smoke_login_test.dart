// Smoke test: a driver signs in with the TEST_MODE OTP and sees today's trip.
//
// Needs a running backend with TEST_MODE=true and the data from
// `node tool/seed_smoke.mjs`. Run on a device or emulator:
//
//   flutter test integration_test/smoke_login_test.dart -d emulator-5554 \
//     --dart-define=API_BASE_URL=http://localhost:8787 \
//     --dart-define=DRIVER_PHONE=9876543210 \
//     --dart-define=OTP=123456 \
//     --dart-define=TRIP_ID=<id printed by the seed script>
import 'package:driver_app/main.dart' as app;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';

const _phone = String.fromEnvironment('DRIVER_PHONE', defaultValue: '9876543210');
const _otp = String.fromEnvironment('OTP', defaultValue: '123456');
const _tripId = String.fromEnvironment('TRIP_ID');

/// Pumps frames until [finder] matches or [timeout] passes. Used instead of
/// pumpAndSettle because skeleton loaders animate forever.
Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('driver logs in with the OTP and sees the trip for today',
      (tester) async {
    // Start from a signed-out device.
    await Hive.initFlutter();
    await Hive.deleteFromDisk();

    // main() is async but returns void; the wait below covers its start-up.
    app.main();
    await _pumpUntil(tester, find.byKey(const Key('phone-field')));

    await tester.enterText(find.byKey(const Key('phone-field')), _phone);
    await tester.pump();
    await tester.tap(find.byKey(const Key('send-otp')));

    await _pumpUntil(tester, find.byKey(const Key('verify-otp')));
    for (var i = 0; i < _otp.length; i++) {
      await tester.enterText(find.byKey(Key('otp-$i')), _otp[i]);
      await tester.pump();
    }
    await tester.tap(find.byKey(const Key('verify-otp')));

    await _pumpUntil(tester, find.byKey(const Key('tab-today')));
    expect(find.byKey(const Key('tab-today')), findsOneWidget);

    final card = _tripId.isEmpty
        ? find.byWidgetPredicate((w) =>
            w.key is ValueKey<String> &&
            (w.key! as ValueKey<String>).value.startsWith('trip-card-'))
        : find.byKey(const Key('trip-card-$_tripId'));
    await _pumpUntil(tester, card);
    expect(card, findsWidgets);
  });
}
