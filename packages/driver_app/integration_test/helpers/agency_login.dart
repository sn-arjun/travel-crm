// Shared sign-in steps for the driver integration tests.
//
// The build carries no agency, so a signed-out phone starts on the agency-code
// screen. Tests call [signIn] (or [chooseAgency] then their own phone steps).
// demo_flow_test.dart is owned by the video studio and is not changed here:
// to keep it working it needs `await chooseAgency(tester)` between launching
// the app and entering the phone number (see the R115 report).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const agencyCode = String.fromEnvironment('AGENCY_CODE', defaultValue: 'demo');
const driverPhone = String.fromEnvironment('DRIVER_PHONE', defaultValue: '9876543210');
const driverOtp = String.fromEnvironment('OTP', defaultValue: '123456');

/// Pumps frames until [finder] matches or [timeout] passes. Used instead of
/// pumpAndSettle because skeleton loaders animate forever.
Future<void> pumpUntil(
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

/// Agency-code screen: type the code, check the agency name that comes back
/// ([expectedName] when given), and confirm. Ends on the phone screen.
Future<void> chooseAgency(
  WidgetTester tester, {
  String code = agencyCode,
  String? expectedName,
}) async {
  await pumpUntil(tester, find.byKey(const Key('agency-code-field')));
  await tester.enterText(find.byKey(const Key('agency-code-field')), code);
  await tester.pump();
  await tester.tap(find.byKey(const Key('agency-continue')));

  await pumpUntil(tester, find.byKey(const Key('agency-name')));
  if (expectedName != null) {
    expect(find.text(expectedName), findsOneWidget);
  }
  await tester.tap(find.byKey(const Key('agency-confirm')));
  await pumpUntil(tester, find.byKey(const Key('phone-field')));
}

/// Phone then OTP, from the phone screen to the Today tab.
Future<void> signInWithPhone(
  WidgetTester tester, {
  String phone = driverPhone,
  String otp = driverOtp,
}) async {
  await tester.enterText(find.byKey(const Key('phone-field')), phone);
  await tester.pump();
  await tester.tap(find.byKey(const Key('send-otp')));

  await pumpUntil(tester, find.byKey(const Key('verify-otp')));
  for (var i = 0; i < otp.length; i++) {
    await tester.enterText(find.byKey(Key('otp-$i')), otp[i]);
    await tester.pump();
  }
  await tester.tap(find.byKey(const Key('verify-otp')));
  await pumpUntil(tester, find.byKey(const Key('tab-today')));
}

/// Agency code, phone and OTP in one call.
Future<void> signIn(WidgetTester tester, {String? expectedName}) async {
  await chooseAgency(tester, expectedName: expectedName);
  await signInWithPhone(tester);
}
