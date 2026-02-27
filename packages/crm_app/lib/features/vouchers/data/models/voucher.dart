import 'package:freezed_annotation/freezed_annotation.dart';

part 'voucher.freezed.dart';
part 'voucher.g.dart';

@freezed
abstract class Voucher with _$Voucher {
  const factory Voucher({
    required String id,
    @JsonKey(name: 'lead_id') String? leadId,
    required String type,
    @JsonKey(name: 'supplier_id') String? supplierId,
    required String title,
    @Default('draft') String status,
    @Default('en') String language,
    String? notes,
    @Default({}) Map<String, dynamic> details,
    @JsonKey(name: 'lead_name') String? leadName,
    @JsonKey(name: 'supplier_name') String? supplierName,
    @JsonKey(name: 'sent_via') String? sentVia,
    @JsonKey(name: 'sent_at') String? sentAt,
    @JsonKey(name: 'confirmed_at') String? confirmedAt,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _Voucher;

  factory Voucher.fromJson(Map<String, dynamic> json) =>
      _$VoucherFromJson(json);
}

// Helper models for specific voucher details

@freezed
abstract class HotelVoucherDetails with _$HotelVoucherDetails {
  const factory HotelVoucherDetails({
    @Default([]) List<String> guestNames,
    @Default('') String hotelName,
    @Default('') String hotelAddress,
    @Default('') String checkIn,
    @Default('') String checkOut,
    @Default('') String roomType,
    @Default(1) int roomCount,
    @Default('EP') String mealPlan,
    @Default('') String specialRequests,
    @Default('') String confirmationNumber,
    @Default('') String emergencyContact,
  }) = _HotelVoucherDetails;

  factory HotelVoucherDetails.fromJson(Map<String, dynamic> json) =>
      _$HotelVoucherDetailsFromJson(json);
}

@freezed
abstract class TransportVoucherDetails with _$TransportVoucherDetails {
  const factory TransportVoucherDetails({
    @Default('') String vehicleType,
    @Default('') String driverName,
    @Default('') String driverPhone,
    @Default('') String pickupLocation,
    @Default('') String pickupTime,
    @Default('') String pickupMapsLink,
    @Default('') String dropLocation,
    @Default('') String dropMapsLink,
    @Default('') String route,
    @Default([]) List<String> sightseeing,
    @Default('') String terms,
  }) = _TransportVoucherDetails;

  factory TransportVoucherDetails.fromJson(Map<String, dynamic> json) =>
      _$TransportVoucherDetailsFromJson(json);
}

@freezed
abstract class FlightPassenger with _$FlightPassenger {
  const factory FlightPassenger({
    @Default('') String name,
    @Default('') String pnr,
  }) = _FlightPassenger;

  factory FlightPassenger.fromJson(Map<String, dynamic> json) =>
      _$FlightPassengerFromJson(json);
}

@freezed
abstract class FlightVoucherDetails with _$FlightVoucherDetails {
  const factory FlightVoucherDetails({
    @Default('') String airline,
    @Default('') String flightNumber,
    @Default('') String departureAirport,
    @Default('') String departureTime,
    @Default('') String departureTerminal,
    @Default('') String arrivalAirport,
    @Default('') String arrivalTime,
    @Default('') String arrivalTerminal,
    @Default([]) List<FlightPassenger> passengers,
    @Default('') String pnr,
    @Default('') String baggageAllowance,
    @Default('') String seatNumbers,
    @Default('economy') String travelClass,
    @Default('') String mealPreference,
  }) = _FlightVoucherDetails;

  factory FlightVoucherDetails.fromJson(Map<String, dynamic> json) =>
      _$FlightVoucherDetailsFromJson(json);
}

@freezed
abstract class ActivityVoucherDetails with _$ActivityVoucherDetails {
  const factory ActivityVoucherDetails({
    @Default('') String activityName,
    @Default('') String dateTime,
    @Default('') String meetingPoint,
    @Default('') String meetingPointMapsLink,
    @Default('') String duration,
    @Default([]) List<String> whatToBring,
    @Default([]) List<String> inclusions,
    @Default('') String emergencyContact,
    @Default('') String operatorContact,
  }) = _ActivityVoucherDetails;

  factory ActivityVoucherDetails.fromJson(Map<String, dynamic> json) =>
      _$ActivityVoucherDetailsFromJson(json);
}
