import 'package:freezed_annotation/freezed_annotation.dart';

part 'driver_model.freezed.dart';
part 'driver_model.g.dart';

@freezed
abstract class DriverModel with _$DriverModel {
  const factory DriverModel({
    required String id,
    required String name,
    required String phone,
    String? email,
    String? photoUrl,
    String? licenseNumber,
    String? licenseExpiry,
    String? address,
    String? emergencyContactName,
    String? emergencyContactPhone,
    @Default('active') String status,
    @Default(0) double rating,
    @Default(0) int totalTrips,
    String? dateOfJoining,
    String? notes,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _DriverModel;

  factory DriverModel.fromJson(Map<String, dynamic> json) =>
      _$DriverModelFromJson(json);
}

@freezed
abstract class DriverDocumentModel with _$DriverDocumentModel {
  const factory DriverDocumentModel({
    required String id,
    String? driverId,
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
  }) = _DriverDocumentModel;

  factory DriverDocumentModel.fromJson(Map<String, dynamic> json) =>
      _$DriverDocumentModelFromJson(json);
}
