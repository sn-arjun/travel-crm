import 'package:freezed_annotation/freezed_annotation.dart';

part 'supplier_rate_card.freezed.dart';
part 'supplier_rate_card.g.dart';

enum RateCardSeason {
  @JsonValue('peak')
  peak,
  @JsonValue('off_peak')
  offPeak,
  @JsonValue('shoulder')
  shoulder,
  @JsonValue('year_round')
  yearRound,
}

enum RateCardUnit {
  @JsonValue('per_night')
  perNight,
  @JsonValue('per_person')
  perPerson,
  @JsonValue('per_trip')
  perTrip,
  @JsonValue('per_day')
  perDay,
  @JsonValue('flat')
  flat,
  @JsonValue('per_vehicle')
  perVehicle,
  @JsonValue('per_room')
  perRoom,
}

@freezed
abstract class SupplierRateCard with _$SupplierRateCard {
  const factory SupplierRateCard({
    required String id,
    @JsonKey(name: 'supplier_id') required String supplierId,
    @JsonKey(name: 'service_type') required String serviceType,
    String? destination,
    required String name,
    String? description,
    RateCardSeason? season,
    @JsonKey(name: 'cost_price') required double costPrice,
    @JsonKey(name: 'selling_price') double? sellingPrice,
    @Default('INR') String currency,
    required RateCardUnit unit,
    @JsonKey(name: 'valid_from') String? validFrom,
    @JsonKey(name: 'valid_to') String? validTo,
    String? notes,
    @JsonKey(name: 'is_active') @Default(true) bool isActive,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) = _SupplierRateCard;

  factory SupplierRateCard.fromJson(Map<String, dynamic> json) => _$SupplierRateCardFromJson(json);
}
