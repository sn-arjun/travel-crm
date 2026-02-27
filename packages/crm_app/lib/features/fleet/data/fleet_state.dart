import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:shared/shared.dart';

part 'fleet_state.freezed.dart';

enum FleetListStatus { initial, loading, loaded, error }

@freezed
abstract class VehicleListState with _$VehicleListState {
  const factory VehicleListState({
    @Default(FleetListStatus.initial) FleetListStatus status,
    @Default([]) List<VehicleModel> items,
    @Default('') String search,
    String? statusFilter,
    String? typeFilter,
    @Default('created_at') String sortBy,
    @Default('desc') String sortOrder,
    PaginationMeta? pagination,
    String? error,
  }) = _VehicleListState;
}

@freezed
abstract class DriverListState with _$DriverListState {
  const factory DriverListState({
    @Default(FleetListStatus.initial) FleetListStatus status,
    @Default([]) List<DriverModel> items,
    @Default('') String search,
    String? statusFilter,
    @Default('created_at') String sortBy,
    @Default('desc') String sortOrder,
    PaginationMeta? pagination,
    String? error,
  }) = _DriverListState;
}

@freezed
abstract class TripListState with _$TripListState {
  const factory TripListState({
    @Default(FleetListStatus.initial) FleetListStatus status,
    @Default([]) List<TripAssignmentModel> items,
    @Default('') String search,
    String? statusFilter,
    String? driverFilter,
    String? vehicleFilter,
    @Default('created_at') String sortBy,
    @Default('desc') String sortOrder,
    PaginationMeta? pagination,
    String? error,
  }) = _TripListState;
}

@freezed
abstract class RateCardListState with _$RateCardListState {
  const factory RateCardListState({
    @Default(FleetListStatus.initial) FleetListStatus status,
    @Default([]) List<VehicleRateCardModel> items,
    @Default('') String search,
    String? vehicleTypeFilter,
    String? tripTypeFilter,
    PaginationMeta? pagination,
    String? error,
  }) = _RateCardListState;
}
