import 'package:freezed_annotation/freezed_annotation.dart';

part 'trip_assignment_model.freezed.dart';
part 'trip_assignment_model.g.dart';

@freezed
abstract class TripAssignmentModel with _$TripAssignmentModel {
  const factory TripAssignmentModel({
    required String id,
    String? leadId,
    String? vehicleId,
    String? driverId,
    String? pickupLocation,
    String? dropLocation,
    String? pickupDatetime,
    String? dropDatetime,
    @Default('assigned') String status,
    String? passengerName,
    String? passengerPhone,
    String? specialInstructions,
    String? assignedBy,
    String? acceptedAt,
    String? enRouteAt,
    String? startedAt,
    String? completedAt,
    String? cancelledAt,
    String? cancellationReason,
    // M19: Check-in/check-out
    String? checkInAt,
    double? checkInLat,
    double? checkInLng,
    String? checkOutAt,
    double? checkOutLat,
    double? checkOutLng,
    // M20: Costing + location + links
    @Default('one_way') String tripType,
    String? rateCardId,
    double? estimatedDistanceKm,
    double? estimatedDurationMin,
    double? estimatedCost,
    Map<String, dynamic>? estimatedBreakdown,
    double? actualDistanceKm,
    double? actualDurationMin,
    double? actualCost,
    Map<String, dynamic>? actualBreakdown,
    double? costOverride,
    String? costOverrideReason,
    double? pickupLat,
    double? pickupLng,
    double? dropLat,
    double? dropLng,
    String? contactId,
    String? invoiceId,
    String? voucherId,
    // Joined fields
    String? driverName,
    String? driverPhone,
    String? vehicleRegistration,
    String? vehicleType,
    String? contactName,
    String? rateCardName,
    String? createdAt,
    String? updatedAt,
  }) = _TripAssignmentModel;

  factory TripAssignmentModel.fromJson(Map<String, dynamic> json) =>
      _$TripAssignmentModelFromJson(json);
}

@freezed
abstract class TripTimelineEntry with _$TripTimelineEntry {
  const factory TripTimelineEntry({
    required String id,
    required String tripId,
    required String status,
    String? changedBy,
    double? latitude,
    double? longitude,
    String? notes,
    String? createdAt,
  }) = _TripTimelineEntry;

  factory TripTimelineEntry.fromJson(Map<String, dynamic> json) =>
      _$TripTimelineEntryFromJson(json);
}

@freezed
abstract class TripCostModel with _$TripCostModel {
  const factory TripCostModel({
    required String id,
    required String tripId,
    required String costType,
    required double amount,
    String? description,
    String? receiptUrl,
    String? createdBy,
    String? createdAt,
  }) = _TripCostModel;

  factory TripCostModel.fromJson(Map<String, dynamic> json) =>
      _$TripCostModelFromJson(json);
}

@freezed
abstract class FleetDashboardModel with _$FleetDashboardModel {
  const factory FleetDashboardModel({
    @Default({}) Map<String, int> vehicleSummary,
    @Default({}) Map<String, int> driverSummary,
    @Default([]) List<TripAssignmentModel> activeTrips,
    @Default([]) List<TripAssignmentModel> upcomingTrips,
    @Default(0) int expiringDocuments,
    @Default(0) int maintenanceDue,
    @Default([]) List<TripAssignmentModel> recentCompleted,
    @Default([]) List<TopDriverModel> topDrivers,
    FleetRevenueModel? revenue,
  }) = _FleetDashboardModel;

  factory FleetDashboardModel.fromJson(Map<String, dynamic> json) =>
      _$FleetDashboardModelFromJson(json);
}

@freezed
abstract class TopDriverModel with _$TopDriverModel {
  const factory TopDriverModel({
    required String id,
    required String name,
    String? phone,
    @Default(0) double rating,
    @Default(0) int totalTrips,
  }) = _TopDriverModel;

  factory TopDriverModel.fromJson(Map<String, dynamic> json) =>
      _$TopDriverModelFromJson(json);
}

@freezed
abstract class FleetRevenueModel with _$FleetRevenueModel {
  const factory FleetRevenueModel({
    @Default(0) double thisMonth,
    @Default(0) int thisMonthTrips,
    @Default(0) double thisMonthCosts,
    @Default(0) double lastMonth,
    @Default(0) int lastMonthTrips,
    @Default([]) List<RevenueByTypeModel> byVehicleType,
    @Default([]) List<RevenueByDriverModel> byDriver,
  }) = _FleetRevenueModel;

  factory FleetRevenueModel.fromJson(Map<String, dynamic> json) =>
      _$FleetRevenueModelFromJson(json);
}

@freezed
abstract class RevenueByTypeModel with _$RevenueByTypeModel {
  const factory RevenueByTypeModel({
    required String vehicleType,
    @Default(0) int trips,
    @Default(0) double revenue,
  }) = _RevenueByTypeModel;

  factory RevenueByTypeModel.fromJson(Map<String, dynamic> json) =>
      _$RevenueByTypeModelFromJson(json);
}

@freezed
abstract class RevenueByDriverModel with _$RevenueByDriverModel {
  const factory RevenueByDriverModel({
    required String id,
    required String name,
    @Default(0) int trips,
    @Default(0) double revenue,
  }) = _RevenueByDriverModel;

  factory RevenueByDriverModel.fromJson(Map<String, dynamic> json) =>
      _$RevenueByDriverModelFromJson(json);
}
