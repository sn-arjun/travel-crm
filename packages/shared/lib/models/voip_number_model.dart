import 'package:freezed_annotation/freezed_annotation.dart';

part 'voip_number_model.freezed.dart';
part 'voip_number_model.g.dart';

@freezed
abstract class VoipNumberModel with _$VoipNumberModel {
  const factory VoipNumberModel({
    required String id,
    required String phoneNumber,
    String? friendlyName,
    String? providerNumberId,
    @Default('twilio') String provider,
    String? assignedTo,
    String? assignedName,
    @Default('general') String purpose,
    @Default(false) bool isDefault,
    @Default(0) double monthlyCost,
    VoipNumberCapabilities? capabilities,
    String? createdAt,
    String? updatedAt,
  }) = _VoipNumberModel;

  factory VoipNumberModel.fromJson(Map<String, dynamic> json) =>
      _$VoipNumberModelFromJson(json);
}

@freezed
abstract class VoipNumberCapabilities with _$VoipNumberCapabilities {
  const factory VoipNumberCapabilities({
    @Default(false) bool voice,
    @Default(false) bool sms,
    @Default(false) bool mms,
  }) = _VoipNumberCapabilities;

  factory VoipNumberCapabilities.fromJson(Map<String, dynamic> json) =>
      _$VoipNumberCapabilitiesFromJson(json);
}

@freezed
abstract class VoipAvailableNumber with _$VoipAvailableNumber {
  const factory VoipAvailableNumber({
    required String phoneNumber,
    String? friendlyName,
    String? region,
    VoipNumberCapabilities? capabilities,
    double? monthlyPrice,
  }) = _VoipAvailableNumber;

  factory VoipAvailableNumber.fromJson(Map<String, dynamic> json) =>
      _$VoipAvailableNumberFromJson(json);
}
