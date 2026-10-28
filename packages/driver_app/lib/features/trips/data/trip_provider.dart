import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/storage/hive_storage.dart';
import '../../../core/utils/api_error.dart';
import 'checkin_queue.dart';
import 'trip_repository.dart';
import 'trip_view.dart';
import 'trip_state.dart';

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  return TripRepository(ref.watch(dioProvider));
});

/// The ticks and stop changes waiting to be sent to the office.
final checkinQueueProvider =
    StateNotifierProvider<CheckinQueue, List<CheckinOp>>((ref) {
  return CheckinQueue(ref.watch(tripRepositoryProvider));
});

/// How many changes of [tripId] have not reached the office yet.
final pendingCheckinsProvider = Provider.family<int, String>((ref, tripId) {
  return ref.watch(checkinQueueProvider).where((o) => o.tripId == tripId).length;
});

// ── Pagination helpers ──────────────────────────────────

const int kTripPageSize = 20;

int? _asInt(dynamic v) {
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}

/// Whether another page exists after [page].
///
/// Uses the backend envelope `{page, limit, total}` (null-safe); falls back to
/// "the page was full" when the envelope is missing or incomplete.
bool computeHasMore({
  required dynamic pagination,
  required int page,
  required int limit,
  required int itemCount,
}) {
  if (itemCount == 0) return false;
  if (pagination is Map) {
    final total = _asInt(pagination['total']);
    if (total != null) {
      final p = _asInt(pagination['page']) ?? page;
      final l = _asInt(pagination['limit']) ?? limit;
      return p * l < total;
    }
  }
  return itemCount >= limit;
}

/// Appends [incoming] to [existing], skipping trips whose id is already there.
List<Map<String, dynamic>> mergeTrips(
  List<Map<String, dynamic>> existing,
  List<Map<String, dynamic>> incoming,
) {
  final seen = existing.map((t) => t['id']).toSet();
  final merged = [...existing];
  for (final trip in incoming) {
    if (seen.add(trip['id'])) merged.add(trip);
  }
  return merged;
}

List<Map<String, dynamic>> _toTripList(dynamic data) {
  if (data is! List) return const [];
  return data
      .whereType<Map>()
      .map((m) => Map<String, dynamic>.from(m))
      .toList();
}

// ── Trip List per Tab ───────────────────────────────────

final tripListProvider = StateNotifierProvider.family<TripListNotifier,
    TripListState, String>((ref, tab) {
  return TripListNotifier(ref.watch(tripRepositoryProvider), tab);
});

class TripListNotifier extends StateNotifier<TripListState> {
  final TripRepository _repo;
  final String _tab;

  TripListNotifier(this._repo, this._tab) : super(const TripListState()) {
    loadTrips();
  }

  Future<void> loadTrips({bool refresh = false}) async {
    if (state.isLoading) return;
    final page = refresh ? 1 : state.page + 1;
    state = state.copyWith(isLoading: true);

    try {
      final response = await _repo.getTrips(
        tab: _tab,
        page: page,
        limit: kTripPageSize,
      );
      if (!mounted) return;
      final trips = _toTripList(response['data']);
      final hasMore = computeHasMore(
        pagination: response['pagination'],
        page: page,
        limit: kTripPageSize,
        itemCount: trips.length,
      );

      final merged = page == 1 ? mergeTrips(const [], trips) : mergeTrips(state.trips, trips);

      // Cache the first page for offline use (cache is per tab).
      if (page == 1) _cacheTrips(merged);

      state = state.copyWith(
        isLoading: false,
        trips: merged,
        hasMore: hasMore,
        page: page,
      );
    } catch (e) {
      if (!mounted) return;
      // Try offline cache
      if (state.trips.isEmpty) {
        final cached = _readCache();
        if (cached.isNotEmpty) {
          state = state.copyWith(
            isLoading: false,
            trips: cached,
            hasMore: false,
            error: 'Showing cached data',
          );
          return;
        }
      }
      state = state.copyWith(
        isLoading: false,
        error: extractApiError(e),
      );
    }
  }

  void _cacheTrips(List<Map<String, dynamic>> trips) {
    try {
      HiveStorage.cacheTrips(_tab, trips);
    } catch (_) {}
  }

  List<Map<String, dynamic>> _readCache() {
    try {
      return _toTripList(HiveStorage.getCachedTrips(_tab));
    } catch (_) {
      return const [];
    }
  }

  Future<void> refresh() => loadTrips(refresh: true);

  Future<void> loadMore() {
    if (!state.hasMore || state.isLoading) return Future.value();
    return loadTrips();
  }
}

// ── Trip Detail ─────────────────────────────────────────

final tripDetailProvider = StateNotifierProvider.family<TripDetailNotifier,
    TripDetailState, String>((ref, tripId) {
  return TripDetailNotifier(
    ref.watch(tripRepositoryProvider),
    tripId,
    queue: ref.read(checkinQueueProvider.notifier),
  );
});

class TripDetailNotifier extends StateNotifier<TripDetailState> {
  final TripRepository _repo;
  final String _tripId;
  final CheckinQueue? _queue;
  StreamSubscription<String>? _sub;

  TripDetailNotifier(this._repo, this._tripId, {CheckinQueue? queue})
      : _queue = queue,
        super(const TripDetailState()) {
    // When the queue has sent every change of this trip, show what the
    // office now has.
    _sub = queue?.tripChanges.where((id) => id == _tripId).listen((_) {
      if (mounted) loadDetail();
    });
    loadDetail();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  /// Changes made on the phone and not yet sent, laid over a server copy.
  Map<String, dynamic> _withPending(Map<String, dynamic> trip) =>
      _queue == null ? trip : applyPendingOps(trip, _queue.state);

  Future<void> loadDetail() async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _repo.getTripDetail(_tripId);
      if (!mounted) return;
      final data = response['data'];
      if (data is Map<String, dynamic> && TripView(data).isCoach) {
        _cacheDetail(data);
      }
      // A reload ends any action in flight: the new status decides which
      // action the driver sees next, and it must not inherit a spinner.
      state = state.copyWith(
        isLoading: false,
        isActionLoading: false,
        trip: data is Map<String, dynamic> ? _withPending(data) : data,
        fromCache: false,
      );
    } catch (e) {
      if (!mounted) return;
      final cached = state.trip == null ? _readDetailCache() : null;
      state = state.copyWith(
        isLoading: false,
        isActionLoading: false,
        trip: cached == null ? null : _withPending(cached),
        error: extractApiError(e),
        fromCache: cached != null || state.trip != null,
      );
    }
  }

  void _cacheDetail(Map<String, dynamic> trip) {
    try {
      HiveStorage.cacheTripDetail(_tripId, trip);
    } catch (_) {}
  }

  Map<String, dynamic>? _readDetailCache() {
    try {
      final raw = HiveStorage.getCachedTripDetail(_tripId);
      if (raw == null) return null;
      // Hive hands back loosely typed maps; a JSON round trip types them.
      final map = jsonDecode(jsonEncode(raw));
      return map is Map<String, dynamic> ? map : null;
    } catch (_) {
      return null;
    }
  }

  // ── Coach trips: ticks and stops are shown at once, then sent in order ──

  /// Ticks a passenger boarded / no_show / pending and/or documents checked.
  Future<void> tickPassenger(
    String passengerId, {
    String? boarding,
    bool? documentsChecked,
  }) async {
    final queue = _queue;
    if (queue == null) return;
    final op = CheckinOp.tick(
      tripId: _tripId,
      passengerId: passengerId,
      boarding: boarding,
      documentsChecked: documentsChecked,
    );
    _showNow(op);
    await queue.enqueue(op);
  }

  /// The coach reached a stop.
  Future<void> arriveStop(String stopId) => _stopOp(stopId, 'arrive');

  /// The coach left a stop (arrives first when that was not recorded).
  Future<void> departStop(String stopId) async {
    final stop =
        TripView(state.trip ?? const {}).stops.where((s) => s.id == stopId);
    if (stop.isNotEmpty && stop.first.status == 'pending') {
      await _stopOp(stopId, 'arrive');
    }
    await _stopOp(stopId, 'depart');
  }

  Future<void> _stopOp(String stopId, String action) async {
    final queue = _queue;
    if (queue == null) return;
    final op = CheckinOp.stop(tripId: _tripId, stopId: stopId, action: action);
    _showNow(op);
    await queue.enqueue(op);
  }

  void _showNow(CheckinOp op) {
    final trip = state.trip;
    if (trip == null || !mounted) return;
    state = state.copyWith(trip: applyPendingOps(trip, [op]), error: state.error);
  }

  Future<bool> acceptTrip() async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.acceptTrip(_tripId);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: extractApiError(e));
      return false;
    }
  }

  Future<bool> rejectTrip(String reason) async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.rejectTrip(_tripId, reason);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: extractApiError(e));
      return false;
    }
  }

  Future<bool> updateStatus(String status,
      {double? latitude, double? longitude}) async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.updateStatus(_tripId, status,
          latitude: latitude, longitude: longitude);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: extractApiError(e));
      return false;
    }
  }

  Future<bool> checkIn(
      {required double lat, required double lng, String? photo}) async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.checkIn(_tripId,
          latitude: lat, longitude: lng, photoBase64: photo);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: extractApiError(e));
      return false;
    }
  }

  Future<bool> checkOut(
      {required double lat, required double lng, String? photo}) async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.checkOut(_tripId,
          latitude: lat, longitude: lng, photoBase64: photo);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: extractApiError(e));
      return false;
    }
  }
}
