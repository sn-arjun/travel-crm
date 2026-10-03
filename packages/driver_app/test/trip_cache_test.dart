import 'dart:io';

import 'package:dio/dio.dart';
import 'package:driver_app/core/storage/hive_storage.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

Map<String, dynamic> _trip(String id) => {
      'id': id,
      'status': 'assigned',
      'pickupLocation': 'Cochin International Airport',
      'dropLocation': 'Fort Kochi',
    };

/// Serves [trips] while online and a connection error while [offline].
class _FlakyRepo extends TripRepository {
  final List<Map<String, dynamic>> trips;
  bool offline;
  int calls = 0;

  _FlakyRepo(this.trips, {this.offline = false}) : super(Dio());

  @override
  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async {
    calls++;
    if (offline) {
      throw DioException(
        requestOptions: RequestOptions(path: '/driver/trips'),
        type: DioExceptionType.connectionError,
      );
    }
    return {
      'success': true,
      'data': trips,
      'pagination': {
        'page': page,
        'limit': limit,
        'total': trips.length,
        'totalPages': 1,
      },
    };
  }
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('driver_hive_');
    Hive.init(dir.path);
    await Hive.openBox('trips_cache');
  });

  tearDown(() async {
    await Hive.close();
    try {
      await dir.delete(recursive: true);
    } catch (_) {}
  });

  group('trip list offline cache', () {
    test('the first page is written to the per-tab cache', () async {
      final repo = _FlakyRepo([_trip('a'), _trip('b')]);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();

      expect(notifier.state.trips.length, 2);
      final cached = HiveStorage.getCachedTrips('today') as List;
      expect(cached.map((t) => (t as Map)['id']), ['a', 'b']);
      expect(HiveStorage.getCachedTrips('past'), isNull);
      expect(HiveStorage.isTripCacheValid('today'), isTrue);
    });

    test('falls back to the cache when the network is down', () async {
      HiveStorage.cacheTrips('today', [_trip('cached-1'), _trip('cached-2')]);
      final notifier =
          TripListNotifier(_FlakyRepo(const [], offline: true), 'today');
      await _settle();

      expect(notifier.state.isLoading, isFalse);
      expect(
          notifier.state.trips.map((t) => t['id']), ['cached-1', 'cached-2']);
      expect(notifier.state.hasMore, isFalse);
      expect(notifier.state.error, 'Showing cached data');
    });

    test('shows a network error when offline and nothing is cached', () async {
      final notifier =
          TripListNotifier(_FlakyRepo(const [], offline: true), 'today');
      await _settle();

      expect(notifier.state.trips, isEmpty);
      expect(notifier.state.error, isNotNull);
      expect(notifier.state.error, isNot('Showing cached data'));
    });

    test('a cache for another tab is not used', () async {
      HiveStorage.cacheTrips('past', [_trip('old')]);
      final notifier =
          TripListNotifier(_FlakyRepo(const [], offline: true), 'today');
      await _settle();

      expect(notifier.state.trips, isEmpty);
    });

    test('a refresh after reconnecting replaces the cached rows', () async {
      HiveStorage.cacheTrips('today', [_trip('cached-1')]);
      final repo = _FlakyRepo([_trip('fresh-1')], offline: true);
      final notifier = TripListNotifier(repo, 'today');
      await _settle();
      expect(notifier.state.trips.single['id'], 'cached-1');

      repo.offline = false;
      await notifier.refresh();

      expect(notifier.state.trips.map((t) => t['id']), ['fresh-1']);
      expect(notifier.state.error, isNull);
      expect(
        (HiveStorage.getCachedTrips('today') as List).single['id'],
        'fresh-1',
      );
    });
  });

  group('auth storage', () {
    setUp(() async => Hive.openBox('driver_auth'));

    test('isAuthenticated follows the access token', () async {
      expect(HiveStorage.isAuthenticated, isFalse);
      HiveStorage.accessToken = 'tok';
      expect(HiveStorage.isAuthenticated, isTrue);
      await HiveStorage.clearAuth();
      expect(HiveStorage.isAuthenticated, isFalse);
    });
  });
}
