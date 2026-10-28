import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:driver_app/core/constants/country_codes.dart';
import 'package:driver_app/core/storage/hive_storage.dart';
import 'package:driver_app/features/auth/data/driver_auth_provider.dart';
import 'package:driver_app/features/auth/data/driver_auth_repository.dart';
import 'package:driver_app/features/auth/presentation/screens/agency_code_screen.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';

const _tenant = '01960000-0000-7000-8000-0000000000a1';

class _FakeRepo extends DriverAuthRepository {
  final List<String> asked = [];
  _FakeRepo() : super(Dio());

  @override
  Future<AgencyInfo> lookupAgency(String code) async {
    asked.add(code);
    if (code.trim().toLowerCase() == 'sahyadri') {
      return const AgencyInfo(
        code: 'sahyadri',
        tenantId: _tenant,
        name: 'Sahyadri Holidays',
      );
    }
    final options = RequestOptions(path: '/driver/agency/$code');
    throw DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response(requestOptions: options, statusCode: 404, data: {
        'success': false,
        'error': {'message': 'Agency code not recognised'},
      }),
    );
  }

  @override
  Future<void> logout() async {}
}

Future<_FakeRepo> _pump(WidgetTester tester) async {
  final repo = _FakeRepo();
  final router = GoRouter(
    initialLocation: '/agency',
    routes: [
      GoRoute(path: '/agency', builder: (_, _) => const AgencyCodeScreen()),
      GoRoute(
          path: '/login', builder: (_, _) => const Scaffold(body: Text('PHONE-SCREEN'))),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [driverAuthRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp.router(
      routerConfig: router,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    ),
  ));
  await tester.pumpAndSettle();
  return repo;
}

void main() {
  setUpAll(() async {
    // In-memory boxes: no files, no path_provider.
    for (final name in [
      'driver_auth',
      'trips_cache',
      'profile_cache',
      'offline_queue',
      'driver_settings',
    ]) {
      await Hive.openBox(name, bytes: Uint8List(0));
    }
  });

  setUp(() async {
    await HiveStorage.clearAgency();
  });

  group('AgencyCodeScreen', () {
    testWidgets('a valid code shows the agency name, then Continue stores it and opens sign-in',
        (tester) async {
      final repo = await _pump(tester);

      await tester.enterText(find.byKey(const Key('agency-code-field')), 'SaHyAdRi');
      await tester.tap(find.byKey(const Key('agency-continue')));
      await tester.pumpAndSettle();

      expect(repo.asked, ['SaHyAdRi']);
      expect(find.byKey(const Key('agency-name')), findsOneWidget);
      expect(find.text('Sahyadri Holidays'), findsOneWidget);
      // Nothing is stored until the driver confirms.
      expect(HiveStorage.hasAgency, isFalse);

      await tester.tap(find.byKey(const Key('agency-confirm')));
      await tester.pumpAndSettle();

      expect(HiveStorage.tenantId, _tenant);
      expect(HiveStorage.agencyName, 'Sahyadri Holidays');
      expect(find.text('PHONE-SCREEN'), findsOneWidget);
    });

    testWidgets('an unknown code shows the error and stores nothing', (tester) async {
      await _pump(tester);

      await tester.enterText(find.byKey(const Key('agency-code-field')), 'nosuchagency');
      await tester.tap(find.byKey(const Key('agency-continue')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('agency-error')), findsOneWidget);
      expect(find.textContaining('could not find that agency code'), findsOneWidget);
      expect(find.byKey(const Key('agency-name')), findsNothing);
      expect(HiveStorage.hasAgency, isFalse);
    });

    testWidgets('an empty code is rejected without asking the server', (tester) async {
      final repo = await _pump(tester);

      await tester.tap(find.byKey(const Key('agency-continue')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('agency-error')), findsOneWidget);
      expect(repo.asked, isEmpty);
    });

    testWidgets('"Not your agency?" goes back to the code field', (tester) async {
      await _pump(tester);

      await tester.enterText(find.byKey(const Key('agency-code-field')), 'sahyadri');
      await tester.tap(find.byKey(const Key('agency-continue')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('agency-not-yours')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('agency-code-field')), findsOneWidget);
      expect(HiveStorage.hasAgency, isFalse);
    });
  });

  group('Change agency', () {
    test('clearAgency forgets the agency, the session and cached data', () async {
      await HiveStorage.saveAgency(tenantId: _tenant, name: 'Sahyadri', code: 'sahyadri');
      HiveStorage.accessToken = 'tok';
      HiveStorage.cacheTrips('today', [1]);
      expect(HiveStorage.hasAgency, isTrue);

      await HiveStorage.clearAgency();

      expect(HiveStorage.hasAgency, isFalse);
      expect(HiveStorage.isAuthenticated, isFalse);
      expect(HiveStorage.getCachedTrips('today'), isNull);
    });

    test('a normal logout keeps the agency', () async {
      await HiveStorage.saveAgency(tenantId: _tenant, name: 'Sahyadri', code: 'sahyadri');
      HiveStorage.accessToken = 'tok';

      await HiveStorage.clearAuth();

      expect(HiveStorage.isAuthenticated, isFalse);
      expect(HiveStorage.tenantId, _tenant);
    });
  });

  group('country codes', () {
    test('the list is the full set, not four codes, with unique ISO codes', () {
      expect(kCountries.length, greaterThan(200));
      expect(kCountries.map((c) => c.iso).toSet().length, kCountries.length);
    });

    test('splitE164 picks the longest dial code', () {
      expect(splitE164('+919876543210')!.country.iso, 'IN');
      expect(splitE164('+919876543210')!.national, '9876543210');
      expect(splitE164('+18765551234')!.country.iso, 'JM');
      expect(splitE164('+14155550132')!.country.iso, 'US');
      expect(splitE164('+971501234567')!.country.iso, 'AE');
      expect(splitE164('9876543210'), isNull);
    });

    test('search matches name, ISO code and dial code', () {
      expect(searchCountries('ger').map((c) => c.iso), contains('DE'));
      expect(searchCountries('+971').map((c) => c.iso), contains('AE'));
      expect(searchCountries('us').map((c) => c.iso), contains('US'));
    });
  });
}
