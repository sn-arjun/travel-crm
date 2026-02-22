import 'package:freezed_annotation/freezed_annotation.dart';

part 'rate_card_model.freezed.dart';
part 'rate_card_model.g.dart';

// ── Helper: backend stores booleans as INTEGER (0/1) ─────────
bool _intOrBoolToBool(dynamic value) {
  if (value is bool) return value;
  if (value is int) return value != 0;
  return false;
}

// ── RateCardModel ────────────────────────────────────────────

@freezed
abstract class RateCardModel with _$RateCardModel {
  const factory RateCardModel({
    required String id,
    String? supplierId,
    required String serviceType,
    String? destination,
    required String name,
    String? description,
    String? season,
    @Default(0.0) double costPrice,
    double? sellingPrice,
    @Default('INR') String currency,
    String? unit,
    String? validFrom,
    String? validTo,
    double? childPricePercent,
    Map<String, dynamic>? groupDiscountJson,
    Map<String, dynamic>? detailsJson,
    @JsonKey(fromJson: _intOrBoolToBool) @Default(true) bool isActive,
    String? createdBy,
    String? supplierName,
    String? createdAt,
    String? updatedAt,
  }) = _RateCardModel;

  factory RateCardModel.fromJson(Map<String, dynamic> json) =>
      _$RateCardModelFromJson(json);
}
