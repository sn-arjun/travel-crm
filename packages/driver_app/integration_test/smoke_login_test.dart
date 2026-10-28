// Smoke test: a driver picks the agency, signs in with the TEST_MODE OTP and sees today's trip.
//
// Needs a running backend with TEST_MODE=true and the data from
// `node tool/seed_smoke.mjs`. Run on a device or emulator:
//
//   flutter test integration_test/smoke_login_test.dart -d emulator-5554 \
//     --dart-define=API_BASE_URL=http://localhost:8787 \
//     --dart-define=AGENCY_CODE=demo \
//     --dart-define=DRIVER_PHONE=9876543210 \
//     --dart-define=OTP=123456 \
//     --dart-define=TRIP_ID=<id printed by the seed script>
import 'package:driver_app/main.dart' as app;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';

import 'helpers/agency_login.dart';

const _tripId = String.fromEnvironment('TRIP_ID');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('driver logs in with the OTP and sees the trip for today',
      (tester) async {
    // Start from a signed-out device.
    await Hive.initFlutter();
    await Hive.deleteFromDisk();

    // main() is async but returns void; the wait below covers its start-up.
    app.main();
    await signIn(tester);
    expect(find.byKey(const Key('tab-today')), findsOneWidget);

    final card = _tripId.isEmpty
        ? find.byWidgetPredicate((w) =>
            w.key is ValueKey<String> &&
            (w.key! as ValueKey<String>).value.startsWith('trip-card-'))
        : find.byKey(const Key('trip-card-$_tripId'));
    await pumpUntil(tester, card);
    expect(card, findsWidgets);
  });
}
