import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/hive_storage.dart';
import 'trip_repository.dart';

final _random = Random.secure();

/// A UUIDv7 (time ordered), used as the `opId` of a tick so the server can
/// recognise a retry.
String newOpId([DateTime? now]) {
  final ms = (now ?? DateTime.now()).millisecondsSinceEpoch;
  final b = List<int>.generate(16, (_) => _random.nextInt(256));
  for (var i = 0; i < 6; i++) {
    b[i] = (ms >> (8 * (5 - i))) & 0xff;
  }
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
      '${h.substring(16, 20)}-${h.substring(20)}';
}

/// One change made on the phone that the office has not heard of yet.
class CheckinOp {
  /// `tick` (a passenger) or `stop` (a stop arrived / departed).
  final String kind;
  final String opId;
  final String tripId;
  final String? passengerId;
  final String? boarding;
  final bool? documentsChecked;
  final String? stopId;

  /// `arrive` or `depart` for a stop op.
  final String? action;

  /// When the person made the change (ISO-8601 with offset).
  final String at;
  int attempts;

  /// Do not try again before this instant (backoff).
  DateTime? nextAttemptAt;

  /// The Hive key once the op is stored; null when storage is unavailable.
  dynamic key;
  Future<void>? stored;

  CheckinOp({
    required this.kind,
    required this.opId,
    required this.tripId,
    this.passengerId,
    this.boarding,
    this.documentsChecked,
    this.stopId,
    this.action,
    required this.at,
    this.attempts = 0,
    this.nextAttemptAt,
    this.key,
  });

  factory CheckinOp.tick({
    required String tripId,
    required String passengerId,
    String? boarding,
    bool? documentsChecked,
    DateTime? now,
    String? opId,
  }) {
    final t = now ?? DateTime.now();
    return CheckinOp(
      kind: 'tick',
      opId: opId ?? newOpId(t),
      tripId: tripId,
      passengerId: passengerId,
      boarding: boarding,
      documentsChecked: documentsChecked,
      at: t.toUtc().toIso8601String(),
    );
  }

  factory CheckinOp.stop({
    required String tripId,
    required String stopId,
    required String action,
    DateTime? now,
    String? opId,
  }) {
    final t = now ?? DateTime.now();
    return CheckinOp(
      kind: 'stop',
      opId: opId ?? newOpId(t),
      tripId: tripId,
      stopId: stopId,
      action: action,
      at: t.toUtc().toIso8601String(),
    );
  }

  Map<String, dynamic> toJson() => {
        'kind': kind,
        'opId': opId,
        'tripId': tripId,
        'passengerId': passengerId,
        'boarding': boarding,
        'documentsChecked': documentsChecked,
        'stopId': stopId,
        'action': action,
        'at': at,
        'attempts': attempts,
        'nextAttemptAt': nextAttemptAt?.toIso8601String(),
      };

  static CheckinOp? fromJson(Map<String, dynamic> j, {dynamic key}) {
    final kind = j['kind'];
    final opId = j['opId'];
    final tripId = j['tripId'];
    final at = j['at'];
    if (kind is! String ||
        opId is! String ||
        tripId is! String ||
        at is! String) {
      return null;
    }
    return CheckinOp(
      kind: kind,
      opId: opId,
      tripId: tripId,
      passengerId: j['passengerId'] as String?,
      boarding: j['boarding'] as String?,
      documentsChecked: j['documentsChecked'] as bool?,
      stopId: j['stopId'] as String?,
      action: j['action'] as String?,
      at: at,
      attempts: (j['attempts'] as num?)?.toInt() ?? 0,
      nextAttemptAt: DateTime.tryParse('${j['nextAttemptAt'] ?? ''}'),
      key: key,
    );
  }
}

/// Seconds to wait after the [attempts]-th failure: 4, 8, 16 ... up to 5 min.
Duration checkinBackoff(int attempts) {
  final secs = 2 << min(max(attempts, 1), 12); // 4, 8, 16 ... then the cap
  return Duration(seconds: min(secs, 300));
}

/// Puts the ops that are still waiting to be sent on top of a trip map from the
/// server or the cache, so a tick stays visible until the office has it.
Map<String, dynamic> applyPendingOps(
  Map<String, dynamic> trip,
  Iterable<CheckinOp> ops,
) {
  final mine = ops.where((o) => o.tripId == trip['id']).toList();
  if (mine.isEmpty) return trip;
  final passengers = trip['passengers'] is List
      ? [
          for (final p in trip['passengers'] as List)
            if (p is Map) Map<String, dynamic>.from(p)
        ]
      : null;
  final stops = trip['stops'] is List
      ? [
          for (final s in trip['stops'] as List)
            if (s is Map) Map<String, dynamic>.from(s)
        ]
      : null;
  for (final o in mine) {
    if (o.kind == 'tick' && passengers != null) {
      for (final p in passengers.where((p) => p['id'] == o.passengerId)) {
        if (o.boarding != null) {
          p['boarding'] = o.boarding;
          p['boardedAt'] = o.boarding == 'boarded' ? o.at : null;
        }
        if (o.documentsChecked != null) {
          p['documentsChecked'] = o.documentsChecked;
          p['documentsCheckedAt'] = o.documentsChecked! ? o.at : null;
        }
      }
    } else if (o.kind == 'stop' && stops != null) {
      for (final s in stops.where((s) => s['id'] == o.stopId)) {
        if (o.action == 'arrive' && s['status'] == 'pending') {
          s['status'] = 'arrived';
          s['arrivedAt'] = o.at;
        } else if (o.action == 'depart' && s['status'] != 'departed') {
          s['status'] = 'departed';
          s['departedAt'] = o.at;
        }
      }
    }
  }
  return {
    ...trip,
    'passengers': ?passengers,
    'stops': ?stops,
  };
}

/// The ticks and stop changes made on the phone, in the order they were made.
///
/// A change shows on screen at once. It is stored on the phone (Hive) and sent
/// to the office in order whenever there is a connection. A retry carries the
/// same `opId`, so the server applies it once. A server answer of 404, 409 or
/// 400/403 means the change can never succeed (the passenger or stop is gone,
/// the trip is closed); the op is dropped and the trip is refreshed.
class CheckinQueue extends StateNotifier<List<CheckinOp>> {
  final TripRepository _repo;
  final DateTime Function() _now;
  final Duration _tick;
  Timer? _timer;
  bool _flushing = false;
  bool _again = false;
  final _changes = StreamController<String>.broadcast();

  CheckinQueue(
    this._repo, {
    DateTime Function()? now,
    Duration retryEvery = const Duration(seconds: 10),
    bool restore = true,
  })  : _now = now ?? DateTime.now,
        _tick = retryEvery,
        super(const []) {
    if (restore) _restore();
  }

  /// Trip ids whose server state changed (all their ops were sent or dropped).
  Stream<String> get tripChanges => _changes.stream;

  /// Ops waiting for [tripId].
  int pendingFor(String tripId) =>
      state.where((o) => o.tripId == tripId).length;

  void _restore() {
    try {
      final ops = <CheckinOp>[];
      for (final e in HiveStorage.pendingCheckins()) {
        final op = CheckinOp.fromJson(e.value, key: e.key);
        if (op != null) ops.add(op);
      }
      if (ops.isEmpty) return;
      state = ops;
      _arm();
      // Left over from a previous session: try again now.
      unawaited(flush(ignoreBackoff: true));
    } catch (_) {
      // Storage not ready (tests, first run): start empty.
    }
  }

  Future<void> enqueue(CheckinOp op) async {
    state = [...state, op];
    op.stored = _store(op);
    _arm();
    unawaited(flush());
  }

  Future<void> tick({
    required String tripId,
    required String passengerId,
    String? boarding,
    bool? documentsChecked,
  }) =>
      enqueue(CheckinOp.tick(
        tripId: tripId,
        passengerId: passengerId,
        boarding: boarding,
        documentsChecked: documentsChecked,
        now: _now(),
      ));

  Future<void> stop({
    required String tripId,
    required String stopId,
    required String action,
  }) =>
      enqueue(CheckinOp.stop(
        tripId: tripId,
        stopId: stopId,
        action: action,
        now: _now(),
      ));

  Future<void> _store(CheckinOp op) async {
    try {
      op.key = await HiveStorage.addCheckin(op.toJson());
    } catch (_) {
      // Not stored: the op still lives in memory for this session.
    }
  }

  Future<void> _forget(CheckinOp op) async {
    if (mounted) state = state.where((o) => !identical(o, op)).toList();
    await op.stored;
    if (op.key != null) {
      try {
        await HiveStorage.removeCheckin(op.key);
      } catch (_) {}
    }
    if (mounted && state.isEmpty) _disarm();
  }

  Future<void> _remember(CheckinOp op) async {
    await op.stored;
    if (op.key != null) {
      try {
        await HiveStorage.updateCheckin(op.key, op.toJson());
      } catch (_) {}
    }
  }

  void _arm() {
    _timer ??= Timer.periodic(_tick, (_) => flush());
  }

  void _disarm() {
    _timer?.cancel();
    _timer = null;
  }

  /// Sends the waiting ops in order. Stops at the first one that cannot reach
  /// the office, so the order is kept. Returns how many were sent or dropped.
  Future<int> flush({bool ignoreBackoff = false}) async {
    if (!mounted) return 0;
    if (_flushing) {
      // A change was made while one was being sent: go round once more.
      _again = true;
      return 0;
    }
    _flushing = true;
    var done = 0;
    final touched = <String>{};
    try {
      var blocked = false;
      do {
        _again = false;
        for (final op in List<CheckinOp>.of(state)) {
          if (!mounted) break;
          final wait = op.nextAttemptAt;
          if (!ignoreBackoff && wait != null && wait.isAfter(_now())) {
            blocked = true;
            break;
          }
          await op.stored;
          try {
            await _send(op);
            await _forget(op);
            touched.add(op.tripId);
            done++;
          } on DioException catch (e) {
            final code = e.response?.statusCode;
            if (code == 400 || code == 403 || code == 404 || code == 409) {
              // It can never succeed: the trip moved on without it.
              await _forget(op);
              touched.add(op.tripId);
              done++;
              continue;
            }
            await _failed(op);
            blocked = true;
            break;
          } catch (_) {
            await _failed(op);
            blocked = true;
            break;
          }
        }
      } while (_again && !blocked && mounted);
    } finally {
      _flushing = false;
    }
    if (mounted) {
      for (final t in touched) {
        if (pendingFor(t) == 0 && !_changes.isClosed) _changes.add(t);
      }
    }
    return done;
  }

  Future<void> _failed(CheckinOp op) async {
    op.attempts++;
    op.nextAttemptAt = _now().add(checkinBackoff(op.attempts));
    await _remember(op);
  }

  Future<void> _send(CheckinOp op) async {
    if (op.kind == 'stop') {
      await _repo.setStopStatus(op.tripId, op.stopId!, op.action!);
    } else {
      await _repo.tickPassenger(
        op.tripId,
        op.passengerId!,
        boarding: op.boarding,
        documentsChecked: op.documentsChecked,
        opId: op.opId,
        at: op.at,
      );
    }
  }

  @override
  void dispose() {
    _disarm();
    _changes.close();
    super.dispose();
  }
}
