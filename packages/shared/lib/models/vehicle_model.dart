import 'package:freezed_annotation/freezed_annotation.dart';
import 'trip_assignment_model.dart';

part 'vehicle_model.freezed.dart';
part 'vehicle_model.g.dart';

@freezed
abstract class VehicleModel with _$VehicleModel {
  const factory VehicleModel({
    required String id,
    required String registrationNumber,
    required String type,
    String? make,
    String? model,
    int? year,
    int? seatingCapacity,
    String? color,
    String? photoUrl,
    @Default('available') String status,
    String? insuranceExpiry,
    String? permitExpiry,
    String? pollutionExpiry,
    String? lastServiceDate,
    String? nextServiceDue,
    int? odometerKm,
    String? notes,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _VehicleModel;

  factory VehicleModel.fromJson(Map<String, dynamic> json) =>
      _$VehicleModelFromJson(json);
}

@freezed
abstract class VehicleDocumentModel with _$VehicleDocumentModel {
  const factory VehicleDocumentModel({
    required String id,
    String? vehicleId,
    required String type,
    String? documentNumber,
    String? fileUrl,
    String? fileName,
    String? expiryDate,
    String? issuedDate,
    @Default(true) bool isActive,
    @Default(false) bool isExpired,
    int? daysUntilExpiry,
    String? createdAt,
    String? updatedAt,
  }) = _VehicleDocumentModel;

  factory VehicleDocumentModel.fromJson(Map<String, dynamic> json) =>
      _$VehicleDocumentModelFromJson(json);
}

@freezed
abstract class VehicleDetailModel with _$VehicleDetailModel {
  const factory VehicleDetailModel({
    required String id,
    required String registrationNumber,
    required String type,
    String? make,
    String? model,
    int? year,
    int? seatingCapacity,
    String? color,
    String? photoUrl,
    @Default('available') String status,
    String? insuranceExpiry,
    String? permitExpiry,
    String? pollutionExpiry,
    String? lastServiceDate,
    String? nextServiceDue,
    int? odometerKm,
    String? notes,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
    @Default([]) List<VehicleDocumentModel> documents,
    @Default([]) List<TripAssignmentModel> upcomingTrips,
    TripAssignmentModel? activeTrip,
    @Default([]) List<VehicleDocumentModel> documentsExpiringSoon,
  }) = _VehicleDetailModel;

  factory VehicleDetailModel.fromJson(Map<String, dynamic> json) =>
      _$VehicleDetailModelFromJson(json);
}
