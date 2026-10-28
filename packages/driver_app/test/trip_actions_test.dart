import 'package:dio/dio.dart';
import 'package:driver_app/app/theme.dart';
import 'package:driver_app/features/auth/data/driver_auth_provider.dart';
import 'package:driver_app/features/auth/data/driver_auth_repository.dart';
import 'package:driver_app/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/presentation/screens/my_trips_screen.dart';
import 'package:driver_app/features/trips/presentation/screens/trip_detail_screen.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _trip(String id, String status) => {
      'id': id,
      'status': status,
      'pickupLocation': 'Cochin International Airport',
      'dropLocation': 'Vembanad Lake Resort, Kumarakom',
      'pickupDatetime': '2026-10-03T10:30:00.000Z',
      'passengerName': 'Arjun Mehta',
      'passengerPhone': '+919820144562',
      'vehicle': {'registration': 'KA 05 MN 4521', 'type': 'sedan'},
    };

/// Records the calls the detail screen makes and moves the trip along.
class _ActionRepo extends TripRepository {
  Map<String, dynamic> trip;
  final List<String> calls = [];

  _ActionRepo(this.trip) : super(Dio());

  @override
  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async =>
      {
        'success': true,
        'data': [trip],
        'pagination': {'page': 1, 'limit': limit, 'total': 1},
      };

  @override
  Future<Map<String, dynamic>> getTripDetail(String id) async =>
      {'success': true, 'data': trip};

  @override
  Future<Map<String, dynamic>> acceptTrip(String id) async {
    calls.add('accept');
    trip = {...trip, 'status': 'accepted'};
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> updateStatus(
    String id,
    String status, {
    double? latitude,
    double? longitude,
    String? notes,
  }) async {
    calls.add('status:$status');
    trip = {...trip, 'status': status};
    return {'success': true};
  }
}

class _FailingAuthRepo extends DriverAuthRepository {
  final Object error;
  int calls = 0;
  _FailingAuthRepo(this.error) : super(Dio());

  @override
  Future<Map<String, dynamic>> sendOtp(String phone) async {
    calls++;
    throw error;
  }
}

Widget _host(Widget child, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme: AppTheme.light,
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

Future<void> _openDetail(WidgetTester tester, _ActionRepo repo) async {
  await tester.pumpWidget(_host(
    const TripDetailScreen(tripId: 't1'),
    overrides: [tripRepositoryProvider.overrideWithValue(repo)],
  ));
  await tester.pumpAndSettle();
}

DioException _bad(dynamic body) {
  final options = RequestOptions(path: '/driver/login');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: 400, data: body),
  );
}

Future<void> _submitPhone(WidgetTester tester, String digits) async {
  await tester.enterText(find.byKey(const Key('phone-field')), digits);
  await tester.tap(find.byKey(const Key('send-otp')));
  await tester.pumpAndSettle();
}

void main() {
  group('Trip detail action per status', () {
    // Mirrors DRIVER_VALID_TRANSITIONS in backend/src/routes/driver.ts:
    // assigned -> accept, accepted -> en_route, en_route -> check-in (which
    // moves the trip to started), started -> completed.
    const expectedKey = {
      'assigned': 'action-accept',
      'accepted': 'action-en-route',
      'en_route': 'action-check-in',
      'started': 'action-complete',
    };

    for (final entry in expectedKey.entries) {
      testWidgets('${entry.key} offers ${entry.value} only', (tester) async {
        await _openDetail(tester, _ActionRepo(_trip('t1', entry.key)));

        expect(find.byKey(Key(entry.value)), findsOneWidget);
        for (final other in expectedKey.values.where((k) => k != entry.value)) {
          expect(find.byKey(Key(other)), findsNothing,
              reason: '$other must not show for ${entry.key}');
        }
        expect(find.byKey(Key('status-chip-${entry.key}')), findsOneWidget);
      });
    }

    for (final status in ['completed', 'cancelled']) {
      testWidgets('$status trips have no action bar', (tester) async {
        await _openDetail(tester, _ActionRepo(_trip('t1', status)));

        expect(find.byKey(const Key('trip-action-bar')), findsNothing);
        expect(find.byKey(Key('status-chip-$status')), findsOneWidget);
      });
    }

    testWidgets('accepting asks for confirmation and then calls accept',
        (tester) async {
      final repo = _ActionRepo(_trip('t1', 'assigned'));
      await _openDetail(tester, repo);

      await tester.tap(find.byKey(const Key('action-accept')));
      await tester.pumpAndSettle();
      expect(repo.calls, isEmpty, reason: 'a confirm dialog comes first');

      await tester.tap(find.byKey(const Key('confirm-accept')));
      await tester.pumpAndSettle();

      expect(repo.calls, ['accept']);
      expect(find.byKey(const Key('action-en-route')), findsOneWidget);
      expect(find.byKey(const Key('action-accept')), findsNothing);
    });

    testWidgets('en route sends the en_route status and swaps the action',
        (tester) async {
      final repo = _ActionRepo(_trip('t1', 'accepted'));
      await _openDetail(tester, repo);

      await tester.tap(find.byKey(const Key('action-en-route')));
      await tester.pumpAndSettle();

      expect(repo.calls, ['status:en_route']);
      expect(find.byKey(const Key('action-check-in')), findsOneWidget);
      // The next action must be tappable, not stuck behind the old spinner.
      final next =
          tester.widget<FilledButton>(find.byKey(const Key('action-check-in')));
      expect(next.onPressed, isNotNull);
    });

    testWidgets('complete sends the completed status and removes the bar',
        (tester) async {
      final repo = _ActionRepo(_trip('t1', 'started'));
      await _openDetail(tester, repo);

      await tester.tap(find.byKey(const Key('action-complete')));
      await tester.pumpAndSettle();

      expect(repo.calls, ['status:completed']);
      expect(find.byKey(const Key('trip-action-bar')), findsNothing);
      expect(find.byKey(const Key('status-chip-completed')), findsOneWidget);
    });
  });

  group('My Trips list', () {
    testWidgets('renders a card for the trip served by the repository',
        (tester) async {
      final repo = _ActionRepo(_trip('t1', 'assigned'));
      await tester.pumpWidget(_host(
        const MyTripsScreen(),
        overrides: [tripRepositoryProvider.overrideWithValue(repo)],
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('trip-card-t1')), findsOneWidget);
      expect(find.byKey(const Key('trips-empty-today')), findsNothing);
    });
  });

  group('Phone screen backend errors', () {
    testWidgets('shows the backend message after a 400 and stops spinning',
        (tester) async {
      final repo = _FailingAuthRepo(_bad({
        'success': false,
        'error': {'message': 'Driver not found', 'code': 'NOT_FOUND'},
      }));
      await tester.pumpWidget(_host(
        const PhoneInputScreen(),
        overrides: [driverAuthRepositoryProvider.overrideWithValue(repo)],
      ));
      await tester.pumpAndSettle();

      await _submitPhone(tester, '9876543210');

      expect(repo.calls, 1);
      expect(find.byKey(const Key('login-error')), findsOneWidget);
      expect(find.text('Driver not found'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      final send =
          tester.widget<FilledButton>(find.byKey(const Key('send-otp')));
      expect(send.onPressed, isNotNull);
    });

    testWidgets('shows a message when the server is unreachable',
        (tester) async {
      final repo = _FailingAuthRepo(DioException(
        requestOptions: RequestOptions(path: '/driver/login'),
        type: DioExceptionType.connectionError,
      ));
      await tester.pumpWidget(_host(
        const PhoneInputScreen(),
        overrides: [driverAuthRepositoryProvider.overrideWithValue(repo)],
      ));
      await tester.pumpAndSettle();

      await _submitPhone(tester, '9876543210');

      expect(find.byKey(const Key('login-error')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('typing again clears the error', (tester) async {
      final repo = _FailingAuthRepo(_bad({'message': 'Too many attempts'}));
      await tester.pumpWidget(_host(
        const PhoneInputScreen(),
        overrides: [driverAuthRepositoryProvider.overrideWithValue(repo)],
      ));
      await tester.pumpAndSettle();

      await _submitPhone(tester, '9876543210');
      expect(find.text('Too many attempts'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('phone-field')), '987654321');
      await tester.pump();
      expect(find.byKey(const Key('login-error')), findsNothing);
    });
  });
}
