import 'package:dio/dio.dart';
import 'package:driver_app/app/theme.dart';
import 'package:driver_app/core/constants/app_colors.dart';
import 'package:driver_app/core/widgets/app_widgets.dart';
import 'package:driver_app/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:driver_app/features/profile/presentation/screens/documents_screen.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/data/trip_view.dart';
import 'package:driver_app/features/trips/presentation/screens/my_trips_screen.dart';
import 'package:driver_app/features/trips/presentation/screens/trip_detail_screen.dart';
import 'package:driver_app/features/trips/presentation/widgets/trip_card.dart';
import 'package:driver_app/features/trips/presentation/widgets/trip_status_badge.dart';
import 'package:driver_app/features/trips/presentation/widgets/trip_timeline.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _trip(String id, {Map<String, dynamic>? extra}) => {
      'id': id,
      'status': 'assigned',
      'pickupLocation': 'Cochin International Airport (COK), Arrival Gate 2',
      'dropLocation': 'Vembanad Lake Resort, Kumarakom',
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
      ...?extra,
    };

class _FakeRepo extends TripRepository {
  final List<Map<String, dynamic>> trips;
  final Object? failure;
  final Future<void>? gate;

  _FakeRepo({this.trips = const [], this.failure, this.gate}) : super(Dio());

  @override
  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async {
    if (gate != null) await gate;
    if (failure != null) throw failure!;
    return {
      'success': true,
      'data': trips,
      'pagination': {
        'page': 1,
        'limit': limit,
        'total': trips.length,
        'totalPages': 1,
      },
    };
  }

  @override
  Future<Map<String, dynamic>> getTripDetail(String id) async {
    if (failure != null) throw failure!;
    return {'success': true, 'data': trips.first};
  }
}

Widget _host(Widget child, {TripRepository? repo, ThemeData? theme}) {
  return ProviderScope(
    overrides: [
      if (repo != null) tripRepositoryProvider.overrideWithValue(repo),
    ],
    child: MaterialApp(
      theme: theme ?? AppTheme.light,
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
  group('theme', () {
    test('light and dark use the desktop indigo', () {
      expect(AppTheme.light.colorScheme.primary, const Color(0xFF4F46E5));
      expect(AppTheme.dark.colorScheme.primary, const Color(0xFF818CF8));
      expect(AppTheme.light.useMaterial3, isTrue);
      expect(AppTheme.dark.brightness, Brightness.dark);
    });

    test('registers semantic tones for both brightnesses', () {
      expect(AppTheme.light.extension<AppSemantic>(), AppSemantic.light);
      expect(AppTheme.dark.extension<AppSemantic>(), AppSemantic.dark);
    });

    test('every input shares one border radius and filled style', () {
      for (final t in [AppTheme.light, AppTheme.dark]) {
        expect(t.inputDecorationTheme.filled, isTrue);
        final border = t.inputDecorationTheme.border! as OutlineInputBorder;
        expect(border.borderRadius, BorderRadius.circular(AppRadius.input));
      }
    });
  });

  group('TripStatusStyle', () {
    testWidgets('maps each status to its own look in light and dark',
        (tester) async {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        late BuildContext ctx;
        await tester.pumpWidget(MaterialApp(
          theme: theme,
          home: Builder(builder: (c) {
            ctx = c;
            return const SizedBox();
          }),
        ));
        final scheme = Theme.of(ctx).colorScheme;
        final styles = {
          for (final s in [
            'assigned',
            'accepted',
            'en_route',
            'started',
            'completed',
            'cancelled',
          ])
            s: TripStatusStyle.of(ctx, s),
        };
        expect(styles['assigned']!.color, scheme.primary);
        expect(styles['assigned']!.container, scheme.primaryContainer);
        expect(styles['cancelled']!.color,
            AppSemantic.of(ctx).danger.color);
        expect(styles['completed']!.color,
            AppSemantic.of(ctx).success.color);
        // Six statuses, six different accents.
        expect(styles.values.map((s) => s.color).toSet().length, 6);
        expect(styles['en_route']!.label, 'En Route');
        expect(TripStatusStyle.of(ctx, 'in_progress').label, 'In Progress');
        expect(TripStatusStyle.of(ctx, 'rejected').color,
            AppSemantic.of(ctx).danger.color);
      }
    });

    testWidgets('badge shows icon and label', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: TripStatusBadge(status: 'en_route')),
      ));
      expect(find.text('En Route'), findsOneWidget);
      expect(find.byIcon(Icons.directions_car_outlined), findsOneWidget);
    });
  });

  group('timeline', () {
    test('lists the whole journey and marks reached steps', () {
      final steps = buildTimelineSteps(_trip('t1', extra: {
        'status': 'accepted',
        'acceptedAt': '2026-10-02T09:00:00.000Z',
      }));
      expect(steps.map((s) => s.status),
          ['assigned', 'accepted', 'en_route', 'started', 'completed']);
      expect(steps.map((s) => s.done), [true, true, false, false, false]);
      expect(steps[1].current, isTrue);
      expect(steps[0].at, isNotNull);
      expect(steps[2].at, isNull);
    });

    test('a completed trip has every step done', () {
      final steps = buildTimelineSteps(_trip('t1', extra: {
        'status': 'completed',
        'acceptedAt': '2026-10-02T09:00:00.000Z',
        'enRouteAt': '2026-10-03T08:00:00.000Z',
        'startedAt': '2026-10-03T10:20:00.000Z',
        'completedAt': '2026-10-03T12:30:00.000Z',
      }));
      expect(steps.every((s) => s.done && s.at != null), isTrue);
      expect(steps.last.current, isTrue);
    });

    test('a cancelled trip ends with a cancelled step', () {
      final steps = buildTimelineSteps(_trip('t1', extra: {
        'status': 'cancelled',
        'timeline': [
          {'status': 'cancelled', 'createdAt': '2026-10-02T12:00:00.000Z'},
        ],
      }));
      expect(steps.map((s) => s.status), ['assigned', 'cancelled']);
      expect(steps.last.label, 'Cancelled');
      expect(steps.last.at, isNotNull);
    });

    testWidgets('renders labels with local times', (tester) async {
      final steps = buildTimelineSteps(_trip('t1', extra: {
        'status': 'accepted',
        'acceptedAt': '2026-10-02T09:00:00.000Z',
      }));
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: SingleChildScrollView(child: TripTimeline(steps: steps))),
      ));
      expect(find.text('Assigned'), findsOneWidget);
      expect(find.text('Accepted'), findsOneWidget);
      expect(find.text('Checked in / Started'), findsOneWidget);
      expect(find.text('Pending'), findsNWidgets(3));
    });
  });

  group('DocumentExpiry', () {
    final now = DateTime(2026, 10, 3);
    test('classifies expired, expiring soon, valid and none', () {
      expect(DocumentExpiry.of('2026-10-01', now: now).state,
          DocumentExpiryState.expired);
      expect(DocumentExpiry.of('2026-10-20', now: now).state,
          DocumentExpiryState.expiringSoon);
      expect(DocumentExpiry.of('2027-03-01', now: now).state,
          DocumentExpiryState.valid);
      expect(DocumentExpiry.of(null, now: now).state, DocumentExpiryState.none);
      expect(DocumentExpiry.of('2027-03-01', now: now).formatted, '1 Mar 2027');
    });
  });

  group('TripCard', () {
    testWidgets('shows pickup time, route, passenger and vehicle chip',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: TripCard(trip: _trip('abc'))),
      ));
      final at = TripView(_trip('abc')).pickupAt!;
      expect(find.text(TripView.formatTime(at)), findsOneWidget);
      expect(find.text('Arjun Mehta'), findsOneWidget);
      expect(find.text('KA 05 MN 4521'), findsOneWidget);
      expect(find.byKey(const Key('status-chip-assigned')), findsOneWidget);
      final size = tester.getSize(find.byKey(const Key('trip-card-abc')));
      expect(size.height, greaterThanOrEqualTo(48));
    });
  });

  group('login', () {
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      testWidgets('country code and phone field share one height (${theme.brightness.name})',
          (tester) async {
        await tester
            .pumpWidget(_host(const PhoneInputScreen(), theme: theme));
        await tester.pumpAndSettle();

        final code = tester.getSize(find.byKey(const Key('country-code')));
        final phone = tester.getSize(find.byKey(const Key('phone-field')));
        expect(code.height, phone.height);
        expect(find.text('TravelCRM Driver'), findsOneWidget);
        expect(find.text('Driver Login'), findsOneWidget);

        // Brand mark icon is tinted with the scheme primary in both themes.
        final icon = tester.widget<Icon>(find.descendant(
            of: find.byKey(const Key('brand-mark')),
            matching: find.byType(Icon)));
        expect(icon.color, theme.colorScheme.primary);

        // Primary action is a full-width filled button.
        final button = find.byKey(const Key('send-otp'));
        expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
        expect(tester.getSize(button).height, greaterThanOrEqualTo(52));
      });
    }
  });

  group('My Trips states', () {
    testWidgets('shows skeleton cards while loading', (tester) async {
      final gate = Future<void>.delayed(const Duration(seconds: 5));
      await tester.pumpWidget(
          _host(const MyTripsScreen(), repo: _FakeRepo(gate: gate)));
      await tester.pump();
      expect(find.byKey(const Key('trips-loading')), findsOneWidget);
      expect(find.byType(TripCardSkeleton), findsWidgets);
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('shows an empty state with refresh', (tester) async {
      await tester
          .pumpWidget(_host(const MyTripsScreen(), repo: _FakeRepo()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('trips-empty-today')), findsOneWidget);
      expect(find.text('No trips scheduled for today'), findsOneWidget);
      expect(find.text('Refresh'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('shows an error state with retry', (tester) async {
      await tester.pumpWidget(_host(const MyTripsScreen(),
          repo: _FakeRepo(failure: StateError('boom'))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('trips-error-today')), findsOneWidget);
      expect(find.text("Couldn't load your trips"), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Retry'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('lists trip cards when there are trips', (tester) async {
      await tester.pumpWidget(_host(const MyTripsScreen(),
          repo: _FakeRepo(trips: [_trip('a'), _trip('b')]),
          theme: AppTheme.dark));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('trip-card-a')), findsOneWidget);
      expect(find.byKey(const Key('trip-card-b')), findsOneWidget);
      expect(find.byKey(const Key('tab-today')), findsOneWidget);
      expect(find.byKey(const Key('tab-upcoming')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Trip detail', () {
    testWidgets('shows header, route, timeline and the accept action',
        (tester) async {
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 't1'),
          repo: _FakeRepo(trips: [_trip('t1')])));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('status-chip-assigned')), findsOneWidget);
      expect(find.byKey(const Key('call-passenger')), findsOneWidget);
      expect(find.byKey(const Key('open-maps-pickup')), findsOneWidget);
      expect(find.byKey(const Key('action-accept')), findsOneWidget);
      expect(find.text('Reject'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.byKey(const Key('trip-timeline')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.byKey(const Key('trip-timeline')), findsOneWidget);
      expect(find.text('KA 05 MN 4521'), findsOneWidget);
    });

    testWidgets('keeps the en-route action key for accepted trips',
        (tester) async {
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 't1'),
          repo: _FakeRepo(trips: [
            _trip('t1', extra: {'status': 'accepted'})
          ])));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('action-en-route')), findsOneWidget);
    });

    testWidgets('shows an error state with retry when the trip fails',
        (tester) async {
      await tester.pumpWidget(_host(const TripDetailScreen(tripId: 't1'),
          repo: _FakeRepo(failure: StateError('boom'))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('trip-error')), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
