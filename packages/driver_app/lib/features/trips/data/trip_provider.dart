import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/storage/hive_storage.dart';
import 'trip_repository.dart';
import 'trip_state.dart';

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  return TripRepository(ref.watch(dioProvider));
});

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
    final offset = refresh ? 0 : state.offset;
    state = state.copyWith(isLoading: true);

    try {
      final response = await _repo.getTrips(tab: _tab, offset: offset);
      final data = response['data'] as List? ?? [];
      final trips = data.cast<Map<String, dynamic>>();
      final pagination = response['pagination'];
      final hasMore = pagination != null
          ? (pagination['offset'] + pagination['limit']) < pagination['total']
          : trips.length >= 20;

      // Cache for offline
      if (refresh || offset == 0) {
        HiveStorage.cacheTrips(_tab, trips);
      }

      state = state.copyWith(
        isLoading: false,
        trips: refresh || offset == 0 ? trips : [...state.trips, ...trips],
        hasMore: hasMore,
        offset: offset + trips.length,
      );
    } catch (e) {
      // Try offline cache
      if (state.trips.isEmpty) {
        final cached = HiveStorage.getCachedTrips(_tab);
        if (cached is List) {
          state = state.copyWith(
            isLoading: false,
            trips: cached.cast<Map<String, dynamic>>(),
            error: 'Showing cached data',
          );
          return;
        }
      }
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
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
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> acceptTrip() async {
    state = state.copyWith(isActionLoading: true);
    try {
      await _repo.acceptTrip(_tripId);
      await loadDetail();
      return true;
    } catch (e) {
      state = state.copyWith(isActionLoading: false, error: e.toString());
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
      state = state.copyWith(isActionLoading: false, error: e.toString());
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
      state = state.copyWith(isActionLoading: false, error: e.toString());
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
      state = state.copyWith(isActionLoading: false, error: e.toString());
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
      state = state.copyWith(isActionLoading: false, error: e.toString());
      return false;
    }
  }
}
