// A driver on a fresh install signs in with an agency code, not a compiled-in
// tenant: agency code -> agency name -> phone -> TEST_MODE OTP -> My Trips.
//
// Needs a TEST_MODE backend seeded by `fix-stack up --slot 0 --reset-db` (demo
// agency, code "demo") and the demo driver from
// `API_URL=http://localhost:8787/api/v1 node tool/seed_smoke.mjs`. On the
// emulator the API is reached through 10.0.2.2:
//
//   flutter test integration_test/agency_login_test.dart -d emulator-5554 \
//     --dart-define=API_BASE_URL=http://10.0.2.2:8787
//
// Optional defines: AGENCY_CODE (demo), AGENCY_NAME (Demo Travel Agency),
// DRIVER_PHONE (9876543210), OTP (123456).
import 'package:driver_app/main.dart' as app;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:integration_test/integration_test.dart';

import 'helpers/agency_login.dart';

const _agencyName =
    String.fromEnvironment('AGENCY_NAME', defaultValue: 'Demo Travel Agency');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('agency code, then phone and OTP, lands on My Trips',
      (tester) async {
    // Fresh install: no agency, no session.
    await Hive.initFlutter();
    await Hive.deleteFromDisk();

    app.main();

    // First screen is the agency code, not the phone screen.
    await pumpUntil(tester, find.byKey(const Key('agency-code-field')));
    expect(find.byKey(const Key('phone-field')), findsNothing);

    // A wrong code is refused and the driver stays on the same screen.
    await tester.enterText(
        find.byKey(const Key('agency-code-field')), 'no-such-agency-xyz');
    await tester.pump();
    await tester.tap(find.byKey(const Key('agency-continue')));
    await pumpUntil(tester, find.byKey(const Key('agency-error')));
    expect(find.byKey(const Key('agency-name')), findsNothing);
    await tester.enterText(find.byKey(const Key('agency-code-field')), '');

    // The right code shows the agency name before anything is stored.
    await chooseAgency(tester, expectedName: _agencyName);
    expect(find.byKey(const Key('agency-banner-name')), findsOneWidget);
    expect(find.text(_agencyName), findsOneWidget);

    await signInWithPhone(tester);
    expect(find.byKey(const Key('tab-today')), findsOneWidget);
  });
}
