import 'dart:io';

import 'package:dio/dio.dart';
import 'package:driver_app/core/storage/hive_storage.dart';
import 'package:driver_app/features/profile/data/profile_repository.dart';
import 'package:driver_app/features/trips/data/checkin_queue.dart';
import 'package:driver_app/features/trips/data/trip_provider.dart';
import 'package:driver_app/features/trips/data/trip_view.dart';
import 'package:driver_app/features/trips/data/trip_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

/// A server that dedupes ticks by `opId`, like the R145 API, and can be made
/// unreachable or answer with a status code.
class _FakeServer extends TripRepository {
  final List<String> sent = []; // 'p1:boarded:<opId>' / 'stop:s1:arrive'
  final Set<String> seenOps = {};
  bool offline = false;
  int? failWith;
  String? failFor; // only this passenger id fails with [failWith]
  int duplicates = 0;

  _FakeServer() : super(Dio());

  Never _fail(int? code) {
    final options = RequestOptions(path: '/driver/trips');
    if (code == null) {
      throw DioException(
          requestOptions: options, type: DioExceptionType.connectionError);
    }
    throw DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response(requestOptions: options, statusCode: code),
    );
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
    if (offline) _fail(null);
    if (failWith != null && (failFor == null || failFor == passengerId)) {
      _fail(failWith);
    }
    final duplicate = !seenOps.add(opId);
    if (duplicate) {
      duplicates++;
    } else {
      sent.add('$passengerId:${boarding ?? ''}${documentsChecked == null ? '' : 'docs=$documentsChecked'}:$opId');
    }
    return {
      'success': true,
      'data': {'applied': !duplicate, 'duplicate': duplicate},
    };
  }

  @override
  Future<Map<String, dynamic>> setStopStatus(
    String tripId,
    String stopId,
    String action, {
    double? latitude,
    double? longitude,
  }) async {
    if (offline) _fail(null);
    sent.add('stop:$stopId:$action');
    return {'success': true};
  }
}

class _DetailServer extends _FakeServer {
  final Map<String, dynamic> trip;
  _DetailServer(this.trip);

  @override
  Future<Map<String, dynamic>> getTripDetail(String id) async {
    if (offline) _fail(null);
    return {'success': true, 'data': trip};
  }
}

void main() {
  late Directory dir;
  late _FakeServer server;
  late DateTime clock;
  final queues = <CheckinQueue>[];

  CheckinQueue newQueue({bool restore = false}) {
    final q = CheckinQueue(
      server,
      now: () => clock,
      retryEvery: const Duration(hours: 1),
      restore: restore,
    );
    queues.add(q);
    return q;
  }

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('driver_checkin_');
    Hive.init(dir.path);
    await Hive.openBox('checkin_queue');
    await Hive.openBox('trips_cache');
    server = _FakeServer();
    clock = DateTime.utc(2026, 10, 3, 6, 30);
  });

  tearDown(() async {
    for (final q in queues) {
      if (q.mounted) q.dispose();
    }
    queues.clear();
    await Hive.close();
    try {
      await dir.delete(recursive: true);
    } catch (_) {}
  });

  String opIdOf(String entry) => entry.split(':').last;

  group('ticks made offline', () {
    test('are sent in order, with their opIds, once online', () async {
      final q = newQueue();
      server.offline = true;

      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await q.tick(tripId: 't1', passengerId: 'p2', boarding: 'no_show');
      await q.tick(tripId: 't1', passengerId: 'p1', documentsChecked: true);
      await q.stop(tripId: 't1', stopId: 's1', action: 'depart');
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(q.state, hasLength(4), reason: 'nothing reached the server');
      expect(server.sent, isEmpty);
      final opIds = q.state.map((o) => o.opId).toList();
      expect(opIds.toSet(), hasLength(4));

      server.offline = false;
      final done = await q.flush(ignoreBackoff: true);

      expect(done, 4);
      expect(q.state, isEmpty);
      expect(server.sent[0], startsWith('p1:boarded:'));
      expect(opIdOf(server.sent[0]), opIds[0]);
      expect(server.sent[1], startsWith('p2:no_show:'));
      expect(opIdOf(server.sent[1]), opIds[1]);
      expect(server.sent[2], startsWith('p1:docs=true:'));
      expect(opIdOf(server.sent[2]), opIds[2]);
      expect(server.sent[3], 'stop:s1:depart');
      expect(HiveStorage.pendingCheckins(), isEmpty);
    });

    test('are stored on the phone and survive a restart', () async {
      final q = newQueue();
      server.offline = true;
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await q.tick(tripId: 't1', passengerId: 'p2', boarding: 'no_show');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(HiveStorage.pendingCheckins(), hasLength(2));
      q.dispose();

      server.offline = false;
      final again = newQueue(restore: true);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(server.sent.map((e) => e.split(':').first), ['p1', 'p2']);
      expect(again.state, isEmpty);
      expect(HiveStorage.pendingCheckins(), isEmpty);
    });

    test('the ticks carry the time they were made', () async {
      final q = newQueue();
      server.offline = true;
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      expect(q.state.single.at, '2026-10-03T06:30:00.000Z');
    });

    test('a failed send backs off, keeps the order and retries later', () async {
      final q = newQueue();
      server.offline = true;
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await q.tick(tripId: 't1', passengerId: 'p2', boarding: 'boarded');
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final first = q.state.first;
      expect(first.attempts, 1);
      expect(first.nextAttemptAt, clock.add(checkinBackoff(1)));
      expect(q.state.last.attempts, 0, reason: 'the second waits behind the first');

      server.offline = false;
      expect(await q.flush(), 0, reason: 'still inside the backoff');
      expect(server.sent, isEmpty);

      clock = clock.add(const Duration(minutes: 10));
      expect(await q.flush(), 2);
      expect(server.sent.map((e) => e.split(':').first), ['p1', 'p2']);
    });

    test('the backoff grows and is capped at five minutes', () {
      expect(checkinBackoff(1), const Duration(seconds: 4));
      expect(checkinBackoff(2), const Duration(seconds: 8));
      expect(checkinBackoff(3), const Duration(seconds: 16));
      expect(checkinBackoff(20), const Duration(minutes: 5));
    });
  });

  group('server answers', () {
    test('a replayed op is harmless', () async {
      final q = newQueue();
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(server.sent, hasLength(1));
      final sentOp = opIdOf(server.sent.single);

      // The phone crashed after sending but before it forgot the op: the same
      // op comes back from storage and is sent again.
      await HiveStorage.addCheckin(CheckinOp.tick(
        tripId: 't1',
        passengerId: 'p1',
        boarding: 'boarded',
        opId: sentOp,
        now: clock,
      ).toJson());
      final replay = newQueue(restore: true);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(server.duplicates, 1);
      expect(server.sent, hasLength(1), reason: 'applied once');
      expect(replay.state, isEmpty);
      expect(HiveStorage.pendingCheckins(), isEmpty);
    });

    test('a 404 drops the op, refreshes the trip and sends the rest', () async {
      final q = newQueue();
      final refreshed = <String>[];
      q.tripChanges.listen(refreshed.add);
      server
        ..failWith = 404
        ..failFor = 'gone';

      await q.tick(tripId: 't1', passengerId: 'gone', boarding: 'boarded');
      await q.tick(tripId: 't1', passengerId: 'p2', boarding: 'boarded');
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(q.state, isEmpty, reason: 'the dead op does not block the queue');
      expect(server.sent.map((e) => e.split(':').first), ['p2']);
      expect(refreshed, contains('t1'));
      expect(HiveStorage.pendingCheckins(), isEmpty);
    });

    test('a 409 (trip closed) drops the op too', () async {
      final q = newQueue();
      server.failWith = 409;
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(q.state, isEmpty);
    });

    test('a 500 keeps the op for a retry', () async {
      final q = newQueue();
      server.failWith = 500;
      await q.tick(tripId: 't1', passengerId: 'p1', boarding: 'boarded');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(q.state, hasLength(1));
      expect(q.state.single.attempts, 1);
    });
  });

  group('trip detail without signal', () {
    final trip = {
      'id': 't1',
      'status': 'accepted',
      'tripKind': 'coach',
      'stops': [
        {'id': 's1', 'sortOrder': 1, 'name': 'Harbour Square', 'status': 'pending'},
      ],
      'passengers': [
        {'id': 'p1', 'tripStopId': 's1', 'name': 'Sam', 'seats': 2, 'boarding': 'pending'},
      ],
    };

    test('shows the last stops and passengers, with the pending ticks on top',
        () async {
      final online = _DetailServer(trip);
      final first = TripDetailNotifier(online, 't1', queue: newQueue());
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(first.state.fromCache, isFalse);
      expect(TripView(first.state.trip!).passengers, hasLength(1));
      first.dispose();

      // Back later, no signal: the saved copy is shown.
      final offline = _DetailServer(trip)..offline = true;
      final q = CheckinQueue(offline, now: () => clock, retryEvery: const Duration(hours: 1), restore: false);
      queues.add(q);
      final second = TripDetailNotifier(offline, 't1', queue: q);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(second.state.fromCache, isTrue);
      final view = TripView(second.state.trip!);
      expect(view.stops.single.name, 'Harbour Square');
      expect(view.passengers!.single.boarding, 'pending');

      // A tick made now shows at once and moves the head count.
      await second.tickPassenger('p1', boarding: 'boarded');
      final after = TripView(second.state.trip!);
      expect(after.passengers!.single.boarding, 'boarded');
      expect(after.headcount!.boarded, 2);
      expect(q.state, hasLength(1), reason: 'waiting for a connection');
      second.dispose();
    });

    test('a trip that was never opened has no saved copy', () async {
      final offline = _DetailServer(trip)..offline = true;
      final n = TripDetailNotifier(offline, 'other', queue: newQueue());
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(n.state.trip, isNull);
      expect(n.state.error, isNotNull);
      n.dispose();
    });
  });

  group('crew role', () {
    test('reads crewRole, then crew_role, else driver', () {
      expect(ProfileRepository.crewRoleOf({'crewRole': 'tour_leader'}), 'tour_leader');
      expect(ProfileRepository.crewRoleOf({'crew_role': 'both'}), 'both');
      expect(ProfileRepository.crewRoleOf({'name': 'x'}), 'driver');
      expect(ProfileRepository.crewRoleOf(null), 'driver');
      expect(ProfileRepository.isTourLeaderRole('both'), isTrue);
      expect(ProfileRepository.isTourLeaderRole('tour_leader'), isTrue);
      expect(ProfileRepository.isTourLeaderRole('driver'), isFalse);
    });
  });

  group('helpers', () {
    test('newOpId is a UUIDv7 that sorts by time', () {
      final a = newOpId(DateTime.utc(2026, 10, 3, 6, 30));
      final b = newOpId(DateTime.utc(2026, 10, 3, 6, 31));
      expect(
        a,
        matches(RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')),
      );
      expect(a.compareTo(b), lessThan(0));
    });

    test('pending ticks are laid over a server copy of the trip', () {
      final trip = {
        'id': 't1',
        'stops': [
          {'id': 's1', 'status': 'pending'},
        ],
        'passengers': [
          {'id': 'p1', 'tripStopId': 's1', 'boarding': 'pending'},
          {'id': 'p2', 'tripStopId': 's1', 'boarding': 'pending'},
        ],
      };
      final out = applyPendingOps(trip, [
        CheckinOp.tick(
            tripId: 't1', passengerId: 'p1', boarding: 'boarded', now: clock),
        CheckinOp.stop(
            tripId: 't1', stopId: 's1', action: 'arrive', now: clock),
        CheckinOp.tick(
            tripId: 'other', passengerId: 'p2', boarding: 'no_show', now: clock),
      ]);
      final passengers = out['passengers'] as List;
      expect((passengers[0] as Map)['boarding'], 'boarded');
      expect((passengers[1] as Map)['boarding'], 'pending');
      expect(((out['stops'] as List).single as Map)['status'], 'arrived');
      expect((trip['passengers'] as List).first['boarding'], 'pending',
          reason: 'the input is not changed');
    });
  });
}
