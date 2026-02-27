import 'package:freezed_annotation/freezed_annotation.dart';

part 'vehicle_rate_card_model.freezed.dart';
part 'vehicle_rate_card_model.g.dart';

@freezed
abstract class VehicleRateCardModel with _$VehicleRateCardModel {
  const factory VehicleRateCardModel({
    required String id,
    String? tenantId,
    required String name,
    required String vehicleType,
    required String tripType,
    @Default(0) double baseFare,
    @Default(0) double perKmRate,
    @Default(0) double perHourRate,
    @Default(0) double minKm,
    @Default(0) double minHours,
    @Default(0) double nightCharge,
    @Default(0) double driverAllowance,
    double? flatRate,
    @Default(0) double extraKmRate,
    @Default(0) double extraHourRate,
    @Default(false) bool tollIncluded,
    @Default(false) bool parkingIncluded,
    @Default('INR') String currency,
    String? validFrom,
    String? validTo,
    String? notes,
    @Default(true) bool isActive,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _VehicleRateCardModel;

  factory VehicleRateCardModel.fromJson(Map<String, dynamic> json) =>
      _$VehicleRateCardModelFromJson(json);
}

@freezed
abstract class TripCostBreakdownModel with _$TripCostBreakdownModel {
  const factory TripCostBreakdownModel({
    @Default(0) double baseFare,
    @Default(0) double kmCharges,
    @Default(0) double timeCharges,
    @Default(0) double nightCharge,
    @Default(0) double driverAllowance,
    @Default(0) double extraKmCharges,
    @Default(0) double extraHourCharges,
    @Default(0) double subtotal,
    @Default(false) bool isFlat,
    @Default(0) double total,
    String? details,
  }) = _TripCostBreakdownModel;

  factory TripCostBreakdownModel.fromJson(Map<String, dynamic> json) =>
      _$TripCostBreakdownModelFromJson(json);
}

@freezed
abstract class CostEstimateResponse with _$CostEstimateResponse {
  const factory CostEstimateResponse({
    VehicleRateCardModel? rateCard,
    TripCostBreakdownModel? breakdown,
  }) = _CostEstimateResponse;

  factory CostEstimateResponse.fromJson(Map<String, dynamic> json) =>
      _$CostEstimateResponseFromJson(json);
}

@freezed
abstract class DistanceResult with _$DistanceResult {
  const factory DistanceResult({
    @Default(0) double distanceKm,
    @Default(0) double durationMinutes,
    @Default('haversine') String source,
  }) = _DistanceResult;

  factory DistanceResult.fromJson(Map<String, dynamic> json) =>
      _$DistanceResultFromJson(json);
}
