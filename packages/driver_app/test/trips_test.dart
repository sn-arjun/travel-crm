import 'package:dio/dio.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:driver_app/features/trips/data/trip_view.dart';
import 'package:driver_app/features/trips/presentation/widgets/trip_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _trip(String id, {Map<String, dynamic>? extra}) => {
      'id': id,
      'status': 'assigned',
      'pickupLocation': 'Cochin International Airport',
      'dropLocation': 'Fort Kochi',
      'pickupDatetime': '2026-10-03T10:30:00.000Z',
      'passengerName': 'Priya Nair',
      'vehicle': {
        'registration': 'KA 05 MN 4521',
        'make': 'Toyota',
        'model': 'Innova Crysta',
        'type': 'suv',
      },
      ...?extra,
    };

/// Serves pages of [total] trips and records the requested pages.
class _PagedRepo extends TripRepository {
  final int total;
  final bool includePagination;
  final List<int> pagesRequested = [];
  final List<Map<String, dynamic>> Function(int page, int limit)? pageBuilder;

  _PagedRepo(this.total, {this.includePagination = true, this.pageBuilder})
      : super(Dio());

  @override
  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async {
    pagesRequested.add(page);
    final start = (page - 1) * limit;
    final end = (start + limit).clamp(0, total);
    final items = pageBuilder != null
        ? pageBuilder!(page, limit)
        : [for (var i = start; i < end; i++) _trip('t$i')];
    return {
      'success': true,
      'data': items,
      if (includePagination)
        'pagination': {
          'page': page,
          'limit': limit,
          'total': total,
          'totalPages': (total / limit).ceil(),
        },
    };
  }
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  group('computeHasMore', () {
    test('uses page * limit < total', () {
      expect(
        computeHasMore(
            pagination: {'page': 1, 'limit': 20, 'total': 45},
            page: 1,
            limit: 20,
            itemCount: 20),
        isTrue,
      );
      expect(
        computeHasMore(
            pagination: {'page': 3, 'limit': 20, 'total': 45},
            page: 3,
            limit: 20,
            itemCount: 5),
        isFalse,
      );
      expect(
        computeHasMore(
            pagination: {'page': 2, 'limit': 20, 'total': 40},
            page: 2,
            limit: 20,
            itemCount: 20),
        isFalse,
      );
    });

    test('is null-safe and tolerates numeric strings', () {
      expect(
        computeHasMore(
            pagination: {'total': '45'}, page: 1, limit: 20, itemCount: 20),
        isTrue,
      );
      expect(
        computeHasMore(
            pagination: {'page': null, 'limit': null, 'total': null},
            page: 1,
            limit: 20,
            itemCount: 7),
        isFalse,
      );
    });

    test('falls back to a full page when there is no envelope', () {
      expect(
          computeHasMore(
              pagination: null, page: 1, limit: 20, itemCount: 20),
          isTrue);
      expect(
          computeHasMore(pagination: null, page: 1, limit: 20, itemCount: 3),
          isFalse);
    });

    test('an empty page never has more', () {
      expect(
          computeHasMore(
              pagination: {'total': 100}, page: 9, limit: 20, itemCount: 0),
          isFalse);
    });
  });

  group('mergeTrips', () {
    test('appends new trips and drops duplicate ids', () {
      final merged = mergeTrips(
        [_trip('a'), _trip('b')],
        [_trip('b'), _trip('c')],
      );
      expect(merged.map((t) => t['id']), ['a', 'b', 'c']);
    });
  });

  group('TripListNotifier', () {
    test('loads page 1 and sends page/limit, not offset', () async {
      final repo = _PagedRepo(45);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();

      expect(repo.pagesRequested, [1]);
      expect(notifier.state.trips.length, 20);
      expect(notifier.state.hasMore, isTrue);
      expect(notifier.state.page, 1);
      expect(notifier.state.error, isNull);
    });

    test('loadMore walks pages 2 and 3 without duplicates', () async {
      final repo = _PagedRepo(45);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();

      await notifier.loadMore();
      await notifier.loadMore();
      await notifier.loadMore(); // no more pages: must not fetch

      expect(repo.pagesRequested, [1, 2, 3]);
      expect(notifier.state.trips.length, 45);
      expect(notifier.state.trips.map((t) => t['id']).toSet().length, 45);
      expect(notifier.state.hasMore, isFalse);
    });

    test('refresh resets to page 1', () async {
      final repo = _PagedRepo(45);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();
      await notifier.loadMore();

      await notifier.refresh();

      expect(repo.pagesRequested, [1, 2, 1]);
      expect(notifier.state.trips.length, 20);
      expect(notifier.state.page, 1);
    });

    test('works when the response has no pagination envelope', () async {
      final repo = _PagedRepo(5, includePagination: false);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();

      expect(notifier.state.trips.length, 5);
      expect(notifier.state.hasMore, isFalse);
    });

    test('a failing request stores a readable error and stops loading',
        () async {
      final repo = _PagedRepo(0, pageBuilder: (_, _) => throw StateError('x'));
      final notifier = TripListNotifier(repo, 'today');
      await _settle();

      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, isNotNull);
    });
  });

  group('TripView', () {
    test('reads the nested vehicle', () {
      final v = _trip('t1').view;
      expect(v.vehicleRegistration, 'KA 05 MN 4521');
      expect(v.vehicleName, 'Toyota Innova Crysta');
      expect(v.vehicleType, 'suv');
    });

    test('falls back to flat vehicle keys', () {
      expect(
        {'id': 'x', 'vehicleRegistration': 'KL 07 AB 1234'}
            .view
            .vehicleRegistration,
        'KL 07 AB 1234',
      );
      expect(
        {'id': 'x', 'vehicle_registration': 'KL 07 AB 9999'}
            .view
            .vehicleRegistration,
        'KL 07 AB 9999',
      );
    });

    test('has no vehicle when the backend sends null', () {
      final v = {'id': 'x', 'vehicle': null}.view;
      expect(v.vehicleRegistration, isNull);
      expect(v.vehicleName, isNull);
    });

    test('parses timestamps into the local time zone', () {
      final v = _trip('t1').view;
      expect(v.pickupAt, isNotNull);
      expect(v.pickupAt!.isUtc, isFalse);
      expect(v.pickupAt!.toUtc(), DateTime.utc(2026, 10, 3, 10, 30));
    });

    test('is null-safe for missing and malformed fields', () {
      final v = <String, dynamic>{'pickupDatetime': 'not a date'}.view;
      expect(v.id, '');
      expect(v.status, 'assigned');
      expect(v.pickupAt, isNull);
      expect(v.dropAt, isNull);
      expect(v.passengerName, isNull);
      expect(v.pickupLat, isNull);
    });

    test('formats a date and time', () {
      expect(TripView.formatDateTime(DateTime(2026, 10, 3, 16, 5)),
          '3 Oct 2026, 4:05 PM');
      expect(TripView.formatDateTime(DateTime(2026, 1, 9, 0, 0)),
          '9 Jan 2026, 12:00 AM');
    });
  });

  group('TripCard', () {
    testWidgets('shows the nested vehicle registration and a trip key',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: TripCard(trip: _trip('abc123'))),
      ));

      expect(find.byKey(const Key('trip-card-abc123')), findsOneWidget);
      expect(find.text('KA 05 MN 4521'), findsOneWidget);
      expect(find.text('Cochin International Airport'), findsOneWidget);
      expect(find.text('Priya Nair'), findsOneWidget);
    });
  });
}
