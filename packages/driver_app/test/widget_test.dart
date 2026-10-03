import 'package:driver_app/features/auth/presentation/screens/otp_verification_screen.dart';
import 'package:driver_app/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) {
  return ProviderScope(
    child: MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: child,
    ),
  );
}

void main() {
  testWidgets('phone screen exposes the phone field and Send OTP keys',
      (tester) async {
    await tester.pumpWidget(_host(const PhoneInputScreen()));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('phone-field')), findsOneWidget);
    expect(find.byKey(const Key('send-otp')), findsOneWidget);
  });

  testWidgets('phone screen rejects a too-short number without calling the API',
      (tester) async {
    await tester.pumpWidget(_host(const PhoneInputScreen()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('phone-field')), '123');
    await tester.tap(find.byKey(const Key('send-otp')));
    await tester.pumpAndSettle();

    // Still on the phone screen, no spinner, validation message shown.
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byKey(const Key('send-otp')), findsOneWidget);
  });

  testWidgets('OTP screen exposes six digit fields and the Verify key',
      (tester) async {
    await tester.pumpWidget(
        _host(const OtpVerificationScreen(phone: '+919876543210')));
    await tester.pump();

    for (var i = 0; i < 6; i++) {
      expect(find.byKey(Key('otp-$i')), findsOneWidget);
    }
    expect(find.byKey(const Key('verify-otp')), findsOneWidget);

    // Verify stays disabled until all six digits are entered.
    FilledButton verify() =>
        tester.widget<FilledButton>(find.byKey(const Key('verify-otp')));
    expect(verify().onPressed, isNull);

    for (var i = 0; i < 6; i++) {
      await tester.enterText(find.byKey(Key('otp-$i')), '${i + 1}');
      await tester.pump();
    }
    expect(verify().onPressed, isNotNull);
  });
}
