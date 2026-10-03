import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/storage/hive_storage.dart';
import '../../../core/utils/api_error.dart';
import 'trip_repository.dart';
import 'trip_state.dart';

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  return TripRepository(ref.watch(dioProvider));
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
  return TripDetailNotifier(ref.watch(tripRepositoryProvider), tripId);
});

class TripDetailNotifier extends StateNotifier<TripDetailState> {
  final TripRepository _repo;
  final String _tripId;

  TripDetailNotifier(this._repo, this._tripId)
      : super(const TripDetailState()) {
    loadDetail();
  }

  Future<void> loadDetail() async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _repo.getTripDetail(_tripId);
      state = state.copyWith(
        isLoading: false,
        trip: response['data'],
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: extractApiError(e));
    }
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
