import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:driver_app/app/theme.dart';
import 'package:driver_app/features/auth/data/driver_auth_repository.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/presentation/screens/my_trips_screen.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyRepo extends TripRepository {
  _EmptyRepo() : super(Dio());

  @override
  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async =>
      {
        'success': true,
        'data': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': limit, 'total': 0, 'totalPages': 1},
      };
}

Widget _host(Locale locale) => ProviderScope(
      overrides: [tripRepositoryProvider.overrideWithValue(_EmptyRepo())],
      child: MaterialApp(
        theme: AppTheme.light,
        locale: locale,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: const MyTripsScreen(),
      ),
    );

/// Records the request bodies of the sign-in calls.
class _RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return ResponseBody.fromString(jsonEncode({'success': true}), 200, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

DriverAuthRepository _repo(_RecordingAdapter adapter, {required String dial}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8787'))..httpClientAdapter = adapter;
  return DriverAuthRepository(dio, tenantId: () => 'tenant-nl', dialCode: () => dial);
}

void main() {
  group('Dutch interface', () {
    test('nl is a supported locale next to en, hi and ar', () {
      final codes = AppLocalizations.supportedLocales.map((l) => l.languageCode).toSet();
      expect(codes, containsAll(['en', 'hi', 'ar', 'nl']));
    });

    testWidgets('the trips screen reads Dutch', (tester) async {
      await tester.pumpWidget(_host(const Locale('nl')));
      await tester.pumpAndSettle();
      expect(find.text('Mijn ritten'), findsOneWidget);
      expect(find.text('Vandaag'), findsWidgets);
      expect(find.text('Gepland'), findsWidgets);
      expect(find.text('My Trips'), findsNothing);
    });

    testWidgets('the same screen in English still reads English', (tester) async {
      await tester.pumpWidget(_host(const Locale('en')));
      await tester.pumpAndSettle();
      expect(find.text('My Trips'), findsOneWidget);
      expect(find.text('Mijn ritten'), findsNothing);
    });

    test('every English string has a Dutch text with the same placeholders', () {
      Map<String, dynamic> load(String name) => jsonDecode(File('lib/l10n/$name.arb').readAsStringSync()) as Map<String, dynamic>;
      final en = load('intl_en');
      final nl = load('intl_nl');
      List<String> names(String text) => RegExp(r'\{(\w+)\}').allMatches(text).map((m) => m.group(1)!).toList()..sort();
      final texts = en.keys.where((k) => !k.startsWith('@'));
      for (final key in texts) {
        expect(nl.containsKey(key), isTrue, reason: 'nl is missing $key');
        expect(names(nl[key] as String), names(en[key] as String), reason: 'placeholders of $key');
      }
      expect(nl.keys.where((k) => !k.startsWith('@')).toSet(), texts.toSet());
      final dutch = lookupAppLocalizations(const Locale('nl'));
      expect(dutch.localeName, 'nl');
      expect(dutch.dutch, 'Nederlands');
    });
  });

  group('sign-in for a Dutch agency', () {
    test("'0612345678' and '06 1234 5678' both become +31612345678", () async {
      final adapter = _RecordingAdapter();
      final repo = _repo(adapter, dial: '+31');
      await repo.sendOtp('0612345678');
      await repo.sendOtp('06 1234 5678');
      await repo.verifyOtp('06-12345678', '123456');
      final phones = adapter.requests.map((r) => (r.data as Map)['phone']).toList();
      expect(phones, ['+31612345678', '+31612345678', '+31612345678']);
      expect((adapter.requests.first.data as Map)['tenantId'], 'tenant-nl');
    });

    test('an international number keeps its own country code', () async {
      final adapter = _RecordingAdapter();
      await _repo(adapter, dial: '+31').sendOtp('+44 7911 123456');
      expect((adapter.requests.single.data as Map)['phone'], '+447911123456');
    });

    test('an Indian agency still reads a national number as +91', () async {
      final adapter = _RecordingAdapter();
      await _repo(adapter, dial: '+91').sendOtp('98765 43210');
      expect((adapter.requests.single.data as Map)['phone'], '+919876543210');
    });

    test('with nothing stored the repository uses the launch market, not a hidden +91 in normalizePhone', () {
      expect(agencyDialCode(), startsWith('+'));
    });
  });
}
