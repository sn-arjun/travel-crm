import 'package:dio/dio.dart';
import 'package:driver_app/app/theme.dart';
import 'package:driver_app/core/utils/phone.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/presentation/screens/trip_detail_screen.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _trip({String status = 'accepted'}) => {
      'id': 't1',
      'status': status,
      'pickupLocation': 'Cochin International Airport (COK), Arrival Gate 2',
      'dropLocation': 'Vembanad Lake Resort, Kumarakom',
      'pickupLat': 10.1518,
      'pickupLng': 76.4019,
      'pickupDatetime': '2026-10-03T10:30:00.000Z',
      'passengerName': 'Arjun Mehta',
      'passengerPhone': '+919820144562',
      'specialInstructions': 'Flight 6E 6171 lands at 10:20. Name board please.',
      'createdAt': '2026-10-02T08:00:00.000Z',
      'vehicle': {
        'registration': 'KA 05 MN 4521',
        'make': 'Toyota',
        'model': 'Innova Crysta',
        'type': 'suv',
      },
    };

class _FakeRepo extends TripRepository {
  final Map<String, dynamic> trip;
  _FakeRepo(this.trip) : super(Dio());

  @override
  Future<Map<String, dynamic>> getTripDetail(String id) async =>
      {'success': true, 'data': trip};
}

Widget _host(Map<String, dynamic> trip) => ProviderScope(
      overrides: [tripRepositoryProvider.overrideWithValue(_FakeRepo(trip))],
      child: MaterialApp(
        theme: AppTheme.light,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: const TripDetailScreen(tripId: 't1'),
      ),
    );

void main() {
  group('formatPhoneDisplay', () {
    test('groups an Indian E.164 number', () {
      expect(formatPhoneDisplay('+919820144562'), '+91 98201 44562');
    });

    test('groups a North American number', () {
      expect(formatPhoneDisplay('+14155550132'), '+1 415 555 0132');
    });

    test('shows a number without a country code as stored', () {
      expect(formatPhoneDisplay('9820144562'), '9820144562');
      expect(formatPhoneDisplay('+3538712345678'), '+3538712345678');
    });
  });

  for (final width in [360.0, 411.0]) {
    group('Trip detail at ${width.toInt()}dp', () {
      testWidgets('Navigate label stays on one line without overflow',
          (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(_host(_trip()));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        final label = find.descendant(
            of: find.byKey(const Key('action-navigate')),
            matching: find.text('Navigate'));
        expect(label, findsOneWidget);
        final style = tester.widget<Text>(label).style ??
            DefaultTextStyle.of(tester.element(label)).style;
        // One line: rendered height below two lines of the label font.
        expect(tester.getSize(label).height,
            lessThan((style.fontSize ?? 14) * 2));
        expect(find.byKey(const Key('action-en-route')), findsOneWidget);
      });

      testWidgets('passenger phone is formatted; call button remains',
          (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(_host(_trip()));
        await tester.pumpAndSettle();

        expect(find.text('+91 98201 44562'), findsOneWidget);
        expect(find.text('+919820144562'), findsNothing);
        expect(find.byKey(const Key('call-passenger')), findsOneWidget);
      });

      testWidgets('last card clears the sticky action bar at the end of scroll',
          (tester) async {
        tester.view.physicalSize = Size(width, 640);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(_host(_trip()));
        await tester.pumpAndSettle();

        await tester.drag(find.byType(ListView).first, const Offset(0, -3000));
        await tester.pumpAndSettle();

        final bar = tester.getRect(find.byKey(const Key('trip-action-bar')));
        final lastCard = find.byKey(const Key('trip-timeline'));
        expect(lastCard, findsOneWidget);
        expect(tester.getRect(lastCard).bottom, lessThanOrEqualTo(bar.top));
      });
    });
  }
}
