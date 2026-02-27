import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import 'fleet_repository.dart';
import 'fleet_state.dart';

// ── Vehicle Providers ─────────────────────────────────────────

final vehicleListProvider =
    StateNotifierProvider<VehicleListNotifier, VehicleListState>(
  (ref) => VehicleListNotifier(repository: ref.read(fleetRepositoryProvider)),
);

class VehicleListNotifier extends StateNotifier<VehicleListState> {
  final FleetRepository _repository;

  VehicleListNotifier({required FleetRepository repository})
      : _repository = repository,
        super(const VehicleListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == FleetListStatus.loading) return;
    state = state.copyWith(
      status: FleetListStatus.loading,
      items: refresh ? [] : state.items,
    );
    try {
      final response = await _repository.getVehicles(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        type: state.typeFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: FleetListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (state.pagination == null || !state.pagination!.hasMore || state.status == FleetListStatus.loading) return;
    state = state.copyWith(status: FleetListStatus.loading);
    try {
      final response = await _repository.getVehicles(
        page: state.pagination!.page + 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        type: state.typeFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: [...state.items, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  void setSearch(String search) { state = state.copyWith(search: search); load(refresh: true); }
  void setStatusFilter(String? status) { state = state.copyWith(statusFilter: status); load(refresh: true); }
  void setTypeFilter(String? type) { state = state.copyWith(typeFilter: type); load(refresh: true); }
  void clearFilters() { state = state.copyWith(search: '', statusFilter: null, typeFilter: null); load(refresh: true); }
}

// ── Driver Providers ──────────────────────────────────────────

final driverListProvider =
    StateNotifierProvider<DriverListNotifier, DriverListState>(
  (ref) => DriverListNotifier(repository: ref.read(fleetRepositoryProvider)),
);

class DriverListNotifier extends StateNotifier<DriverListState> {
  final FleetRepository _repository;

  DriverListNotifier({required FleetRepository repository})
      : _repository = repository,
        super(const DriverListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == FleetListStatus.loading) return;
    state = state.copyWith(
      status: FleetListStatus.loading,
      items: refresh ? [] : state.items,
    );
    try {
      final response = await _repository.getDrivers(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  Future<void> loadNextPage() async {
    if (state.pagination == null || !state.pagination!.hasMore || state.status == FleetListStatus.loading) return;
    state = state.copyWith(status: FleetListStatus.loading);
    try {
      final response = await _repository.getDrivers(
        page: state.pagination!.page + 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: [...state.items, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  void setSearch(String search) { state = state.copyWith(search: search); load(refresh: true); }
  void setStatusFilter(String? status) { state = state.copyWith(statusFilter: status); load(refresh: true); }
  void clearFilters() { state = state.copyWith(search: '', statusFilter: null); load(refresh: true); }
}

// ── Trip Providers ────────────────────────────────────────────

final tripListProvider =
    StateNotifierProvider<TripListNotifier, TripListState>(
  (ref) => TripListNotifier(repository: ref.read(fleetRepositoryProvider)),
);

class TripListNotifier extends StateNotifier<TripListState> {
  final FleetRepository _repository;

  TripListNotifier({required FleetRepository repository})
      : _repository = repository,
        super(const TripListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == FleetListStatus.loading) return;
    state = state.copyWith(
      status: FleetListStatus.loading,
      items: refresh ? [] : state.items,
    );
    try {
      final response = await _repository.getTrips(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        driverId: state.driverFilter,
        vehicleId: state.vehicleFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  Future<void> loadNextPage() async {
    if (state.pagination == null || !state.pagination!.hasMore || state.status == FleetListStatus.loading) return;
    state = state.copyWith(status: FleetListStatus.loading);
    try {
      final response = await _repository.getTrips(
        page: state.pagination!.page + 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        driverId: state.driverFilter,
        vehicleId: state.vehicleFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: [...state.items, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  void setSearch(String search) { state = state.copyWith(search: search); load(refresh: true); }
  void setStatusFilter(String? status) { state = state.copyWith(statusFilter: status); load(refresh: true); }
  void clearFilters() { state = state.copyWith(search: '', statusFilter: null, driverFilter: null, vehicleFilter: null); load(refresh: true); }
}

// ── Rate Card Providers (M20) ─────────────────────────────────

final rateCardListProvider =
    StateNotifierProvider<RateCardListNotifier, RateCardListState>(
  (ref) => RateCardListNotifier(repository: ref.read(fleetRepositoryProvider)),
);

class RateCardListNotifier extends StateNotifier<RateCardListState> {
  final FleetRepository _repository;

  RateCardListNotifier({required FleetRepository repository})
      : _repository = repository,
        super(const RateCardListState());

  Future<void> load({bool refresh = false}) async {
    if (state.status == FleetListStatus.loading) return;
    state = state.copyWith(
      status: FleetListStatus.loading,
      items: refresh ? [] : state.items,
    );
    try {
      final response = await _repository.getVehicleRateCards(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        vehicleType: state.vehicleTypeFilter,
        tripType: state.tripTypeFilter,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  Future<void> loadNextPage() async {
    if (state.pagination == null || !state.pagination!.hasMore || state.status == FleetListStatus.loading) return;
    state = state.copyWith(status: FleetListStatus.loading);
    try {
      final response = await _repository.getVehicleRateCards(
        page: state.pagination!.page + 1,
        search: state.search.isEmpty ? null : state.search,
        vehicleType: state.vehicleTypeFilter,
        tripType: state.tripTypeFilter,
      );
      state = state.copyWith(
        status: FleetListStatus.loaded,
        items: [...state.items, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(status: FleetListStatus.error, error: _extractError(e));
    }
  }

  void setSearch(String search) { state = state.copyWith(search: search); load(refresh: true); }
  void setVehicleTypeFilter(String? type) { state = state.copyWith(vehicleTypeFilter: type); load(refresh: true); }
  void setTripTypeFilter(String? type) { state = state.copyWith(tripTypeFilter: type); load(refresh: true); }
  void clearFilters() { state = state.copyWith(search: '', vehicleTypeFilter: null, tripTypeFilter: null); load(refresh: true); }
}

// ── Dashboard Provider ────────────────────────────────────────

final fleetDashboardProvider = FutureProvider<FleetDashboardModel>((ref) async {
  final repo = ref.read(fleetRepositoryProvider);
  return repo.getDashboard();
});

// ── Helpers ───────────────────────────────────────────────────

String _extractError(dynamic e) {
  if (e is DioException) {
    return e.response?.data?['error']?['message'] ?? e.message ?? 'Unknown error';
  }
  return e.toString();
}
