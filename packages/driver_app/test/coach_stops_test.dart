import 'package:dio/dio.dart';
import 'package:driver_app/app/theme.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/data/trip_view.dart';
import 'package:driver_app/features/trips/presentation/screens/stop_screen.dart';
import 'package:driver_app/features/trips/presentation/screens/trip_detail_screen.dart';
import 'package:driver_app/features/trips/presentation/widgets/trip_card.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

Map<String, dynamic> _stop(String id, int order, String name, String status,
        {bool docs = false, String? at}) =>
    {
      'id': id,
      'tripId': 'c1',
      'sortOrder': order,
      'name': name,
      'address': '$name street',
      'lat': null,
      'lng': null,
      'scheduledAt': at,
      'documentsCheck': docs,
      'status': status,
    };

Map<String, dynamic> _pax(String id, String stopId, String name,
        {int seats = 1, String boarding = 'pending', bool docs = false}) =>
    {
      'id': id,
      'tripStopId': stopId,
      'name': name,
      'seats': seats,
      'phone': null,
      'boarding': boarding,
      'documentsChecked': docs,
    };

/// A coach trip with invented stops. Stops are given out of order on purpose.
Map<String, dynamic> _coach({bool withPassengers = true, String status = 'accepted'}) => {
      'id': 'c1',
      'status': status,
      'tripKind': 'coach',
      'myRole': 'tour_leader',
      'canSeePassengers': withPassengers,
      'pickupLocation': 'Depot',
      'dropLocation': 'Lakeside Hotel',
      'pickupDatetime': '2026-10-03T05:00:00.000Z',
      'stops': [
        _stop('s2', 2, 'Harbour Square', 'arrived',
            docs: true, at: '2026-10-03T06:30:00.000Z'),
        _stop('s3', 3, 'Old Mill Road', 'pending', at: '2026-10-03T07:15:00.000Z'),
        _stop('s1', 1, 'Central Depot', 'departed', at: '2026-10-03T05:45:00.000Z'),
      ],
      'headcount': {
        'expected': 5,
        'boarded': 0,
        'noShow': 0,
        'pending': 5,
        'documentsChecked': 0,
        'byStop': <dynamic>[],
      },
      if (withPassengers)
        'passengers': [
          _pax('p1', 's2', 'Sam Visser', seats: 2),
          _pax('p2', 's2', 'Alex Jansen'),
          _pax('p3', 's3', 'Robin de Vries', seats: 2),
        ],
    };

/// A server that keeps the trip and applies the calls it gets.
class _CoachRepo extends TripRepository {
  Map<String, dynamic> trip;
  final List<String> calls = [];

  _CoachRepo(this.trip) : super(Dio());

  @override
  Future<Map<String, dynamic>> getTripDetail(String id) async =>
      {'success': true, 'data': trip};

  @override
  Future<Map<String, dynamic>> setStopStatus(
    String tripId,
    String stopId,
    String action, {
    double? latitude,
    double? longitude,
  }) async {
    calls.add('stop:$stopId:$action');
    trip = {
      ...trip,
      'stops': [
        for (final s in trip['stops'] as List)
          if ((s as Map)['id'] == stopId)
            {...s, 'status': action == 'arrive' ? 'arrived' : 'departed'}
          else
            s,
      ],
    };
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> tickPassenger(
    String tripId,
    String passengerId, {
    String? boarding,
    bool? documentsChecked,
    required String opId,
    String? at,
  }) async {
    calls.add('tick:$passengerId:${boarding ?? ''}${documentsChecked ?? ''}');
    trip = {
      ...trip,
      'passengers': [
        for (final p in trip['passengers'] as List)
          if ((p as Map)['id'] == passengerId)
            {
              ...p,
              'boarding': ?boarding,
              'documentsChecked': ?documentsChecked,
            }
          else
            p,
      ],
    };
    return {'success': true, 'data': {}};
  }
}

Widget _host(Widget home, _CoachRepo repo, {Locale? locale}) => ProviderScope(
      overrides: [tripRepositoryProvider.overrideWithValue(repo)],
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
        home: home,
      ),
    );

/// The stop screen needs a router: "Complete stop" pops back.
Widget _routed(_CoachRepo repo, String stopId, {Locale? locale}) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => Scaffold(
          body: Center(
            child: TextButton(
              key: const Key('open-stop'),
              onPressed: () => context.push('/stop'),
              child: const Text('open'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: '/stop',
        builder: (context, state) => StopScreen(tripId: 'c1', stopId: stopId),
      ),
    ],
  );
  return ProviderScope(
    overrides: [tripRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp.router(
      theme: AppTheme.light,
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

Future<void> _openStop(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('open-stop')));
  await tester.pumpAndSettle();
}

String _textOf(WidgetTester tester, Key key) {
  final texts = find.descendant(of: find.byKey(key), matching: find.byType(Text));
  return tester.widgetList<Text>(texts).map((t) => t.data ?? '').join('|');
}

/// A tall phone, so the whole trip detail is on screen without scrolling.
void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  group('stop timeline on the trip detail', () {
    testWidgets('lists the stops in order with time, status and badges',
        (tester) async {
      _tall(tester);
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 'c1'), repo));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('stop-timeline')), findsOneWidget);
      final y = [
        for (final id in ['s1', 's2', 's3'])
          tester.getTopLeft(find.byKey(Key('stop-card-$id'))).dy,
      ];
      expect(y[0] < y[1] && y[1] < y[2], isTrue,
          reason: 'sorted by sortOrder, not by the order sent');

      expect(find.descendant(of: find.byKey(const Key('stop-card-s1')), matching: find.text('Central Depot')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('stop-status-s1'))).data, 'Departed');
      expect(tester.widget<Text>(find.byKey(const Key('stop-status-s2'))).data, 'Arrived');
      expect(tester.widget<Text>(find.byKey(const Key('stop-status-s3'))).data, 'Pending');
      expect(find.byKey(const Key('stop-time-s2')), findsOneWidget);

      // Only the stop with a documents check has the badge.
      expect(find.byKey(const Key('stop-docs-s2')), findsOneWidget);
      expect(find.byKey(const Key('stop-docs-s1')), findsNothing);
      expect(find.byKey(const Key('stop-docs-s3')), findsNothing);

      // The coach is at s2: Depart there, no Arrived anywhere.
      expect(find.byKey(const Key('stop-depart-s2')), findsOneWidget);
      expect(find.byKey(const Key('stop-arrive-s3')), findsNothing);
      expect(find.byKey(const Key('stop-arrive-s2')), findsNothing);
      expect(find.byKey(const Key('crew-badge')), findsOneWidget);
    });

    testWidgets('Arrived and Depart are sent and move the stop', (tester) async {
      _tall(tester);
      final trip = _coach();
      (trip['stops'] as List)[0]['status'] = 'departed'; // s2 departed
      final repo = _CoachRepo(trip);
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 'c1'), repo));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('stop-arrive-s3')), findsOneWidget);
      await tester.tap(find.byKey(const Key('stop-arrive-s3')));
      await tester.pumpAndSettle();

      expect(repo.calls, ['stop:s3:arrive']);
      expect(tester.widget<Text>(find.byKey(const Key('stop-status-s3'))).data, 'Arrived');
      expect(find.byKey(const Key('stop-depart-s3')), findsOneWidget);

      await tester.tap(find.byKey(const Key('stop-depart-s3')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['stop:s3:arrive', 'stop:s3:depart']);
      expect(tester.widget<Text>(find.byKey(const Key('stop-status-s3'))).data, 'Departed');
    });

    testWidgets('a driver without passengers sees stops and the head count only',
        (tester) async {
      _tall(tester);
      final repo = _CoachRepo(_coach(withPassengers: false));
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 'c1'), repo));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('stop-card-s1')), findsOneWidget);
      expect(find.byKey(const Key('headcount')), findsOneWidget);
      expect(find.byKey(const Key('headcount-stop')), findsNothing);
      // No per stop passenger count and no way into a passenger screen.
      expect(find.byKey(const Key('stop-count-s2')), findsNothing);
      expect(TripView(_coach(withPassengers: false)).passengers, isNull);
      // Tapping the card does nothing (no router in this host: it would throw).
      await tester.tap(find.byKey(const Key('stop-card-s2')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('a transfer trip shows no stops', (tester) async {
      final repo = _CoachRepo({
        'id': 'c1',
        'status': 'accepted',
        'pickupLocation': 'Airport',
        'dropLocation': 'Hotel',
      });
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 'c1'), repo));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('stop-timeline')), findsNothing);
      expect(find.byKey(const Key('headcount')), findsNothing);
    });
  });

  group('stop screen', () {
    testWidgets('ticks update the head count at once', (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's2'));
      await tester.pumpAndSettle();
      await _openStop(tester);

      expect(find.byKey(const Key('passenger-p1')), findsOneWidget);
      expect(find.byKey(const Key('passenger-p2')), findsOneWidget);
      expect(find.byKey(const Key('passenger-p3')), findsNothing,
          reason: 'p3 boards at another stop');
      expect(_textOf(tester, const Key('headcount-stop')), contains('0 of 3 boarded'));
      expect(_textOf(tester, const Key('headcount-overall')), contains('0 of 5 boarded'));

      await tester.tap(find.byKey(const Key('passenger-p1-boarded')));
      await tester.pumpAndSettle();
      expect(_textOf(tester, const Key('headcount-stop')), contains('2 of 3 boarded'));
      expect(_textOf(tester, const Key('headcount-overall')), contains('2 of 5 boarded'));

      await tester.tap(find.byKey(const Key('passenger-p2-no-show')));
      await tester.pumpAndSettle();
      expect(_textOf(tester, const Key('headcount-stop')), contains('1 no-show'));

      // A second tap on the active button undoes the tick.
      await tester.tap(find.byKey(const Key('passenger-p1-boarded')));
      await tester.pumpAndSettle();
      expect(_textOf(tester, const Key('headcount-stop')), contains('0 of 3 boarded'));

      expect(repo.calls, [
        'tick:p1:boarded',
        'tick:p2:no_show',
        'tick:p1:pending',
      ]);
    });

    testWidgets('the documents toggle shows on a documents-check stop',
        (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's2'));
      await tester.pumpAndSettle();
      await _openStop(tester);

      expect(find.byKey(const Key('passenger-p1-documents')), findsOneWidget);
      expect(find.byKey(const Key('passenger-p1-menu')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('passenger-p1-documents')));
      await tester.tap(find.byKey(const Key('passenger-p1-documents')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['tick:p1:true']);
    });

    testWidgets('elsewhere the documents mark is in the menu', (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's3'));
      await tester.pumpAndSettle();
      await _openStop(tester);

      expect(find.byKey(const Key('passenger-p3-documents')), findsNothing);
      await tester.tap(find.byKey(const Key('passenger-p3-menu')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('passenger-p3-documents')), findsOneWidget);
      await tester.tap(find.byKey(const Key('passenger-p3-documents')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['tick:p3:true']);
    });

    testWidgets('Complete stop departs the stop and goes back', (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's3'));
      await tester.pumpAndSettle();
      await _openStop(tester);

      await tester.tap(find.byKey(const Key('passenger-p3-boarded')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('complete-stop')));
      await tester.pumpAndSettle();

      // s3 was pending: arrival is recorded first, then the departure.
      expect(repo.calls, ['tick:p3:boarded', 'stop:s3:arrive', 'stop:s3:depart']);
      expect(find.byKey(const Key('open-stop')), findsOneWidget,
          reason: 'back on the previous screen');
    });

    testWidgets('Complete stop asks first when passengers are not ticked',
        (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's2'));
      await tester.pumpAndSettle();
      await _openStop(tester);

      await tester.tap(find.byKey(const Key('complete-stop')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('confirm-complete-stop')), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.tap(find.byKey(const Key('confirm-complete-stop')));
      await tester.pumpAndSettle();
      expect(repo.calls, ['stop:s2:depart']);
    });

    testWidgets('renders in Dutch', (tester) async {
      final repo = _CoachRepo(_coach());
      await tester.pumpWidget(_routed(repo, 's2', locale: const Locale('nl')));
      await tester.pumpAndSettle();
      await _openStop(tester);

      expect(find.text('Aan boord'), findsWidgets);
      expect(find.text('Niet verschenen'), findsWidgets);
      expect(find.text('Halte afronden'), findsOneWidget);
      expect(find.text('Passagiers die hier instappen'), findsOneWidget);
      expect(_textOf(tester, const Key('headcount-stop')), contains('0 van 3 aan boord'));
    });
  });

  group('trip card', () {
    Widget card(Map<String, dynamic> trip, {String? role}) => MaterialApp(
          theme: AppTheme.light,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: TripCard(trip: trip, crewRole: role)),
        );

    final row = {
      'id': 'c1',
      'status': 'accepted',
      'pickupLocation': 'Depot',
      'dropLocation': 'Lakeside Hotel',
      'pickupDatetime': '2026-10-03T05:00:00.000Z',
      'tripKind': 'coach',
      'coach': {
        'stopCount': 7,
        'passengerCount': 31,
        'nextStop': {
          'id': 's2',
          'name': 'Harbour Square',
          'scheduledAt': '2026-10-03T06:30:00.000Z',
        },
      },
    };

    testWidgets('shows stops, passengers and the next stop', (tester) async {
      await tester.pumpWidget(card(row));
      expect(find.text('7 stops, 31 passengers'), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('coach-next-stop'))).data,
        startsWith('Next: Harbour Square at '),
      );
      expect(find.byKey(const Key('crew-badge')), findsNothing);
    });

    testWidgets('a tour leader gets the crew badge', (tester) async {
      await tester.pumpWidget(card(row, role: 'tour_leader'));
      expect(find.byKey(const Key('crew-badge')), findsOneWidget);
      expect(find.text('Tour leader'), findsOneWidget);
    });

    testWidgets('a transfer trip has no coach line', (tester) async {
      await tester.pumpWidget(card({
        'id': 't1',
        'status': 'assigned',
        'pickupLocation': 'Airport',
        'dropLocation': 'Hotel',
      }, role: 'tour_leader'));
      expect(find.byKey(const Key('coach-line')), findsNothing);
    });
  });
}
