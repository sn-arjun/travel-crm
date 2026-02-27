import 'package:freezed_annotation/freezed_annotation.dart';

part 'supplier.freezed.dart';
part 'supplier.g.dart';

enum SupplierCategory {
  @JsonValue('hotel')
  hotel,
  @JsonValue('transport')
  transport,
  @JsonValue('airline')
  airline,
  @JsonValue('activity_provider')
  activityProvider,
  @JsonValue('guide')
  guide,
  @JsonValue('visa_agent')
  visaAgent,
  @JsonValue('insurance')
  insurance,
}

enum SupplierStatus {
  @JsonValue('active')
  active,
  @JsonValue('inactive')
  inactive,
}

@freezed
abstract class Supplier with _$Supplier {
  const factory Supplier({
    required String id,
    @JsonKey(name: 'company_name') required String companyName,
    @JsonKey(name: 'contact_person') String? contactPerson,
    String? email,
    String? phone,
    String? address,
    String? city,
    String? state,
    String? country,
    @JsonKey(name: 'postal_code') String? postalCode,
    @JsonKey(name: 'gst_number') String? gstNumber,
    @JsonKey(name: 'tax_id') String? taxId,
    required SupplierCategory category,
    String? website,
    String? notes,
    @Default(0.0) double rating,
    @JsonKey(name: 'is_preferred') @Default(false) bool isPreferred,
    @Default(SupplierStatus.active) SupplierStatus status,
    @JsonKey(name: 'total_rate_cards') int? totalRateCards,
    @JsonKey(name: 'total_payments') double? totalPayments,
    @JsonKey(name: 'created_at') DateTime? createdAt,
    @JsonKey(name: 'updated_at') DateTime? updatedAt,
  }) = _Supplier;

  factory Supplier.fromJson(Map<String, dynamic> json) => _$SupplierFromJson(json);
}
