import 'package:freezed_annotation/freezed_annotation.dart';

part 'twilio_number_model.freezed.dart';
part 'twilio_number_model.g.dart';

@freezed
abstract class TwilioNumberModel with _$TwilioNumberModel {
  const factory TwilioNumberModel({
    required String id,
    required String phoneNumber,
    String? friendlyName,
    required String twilioSid,
    String? assignedTo,
    String? assignedName,
    @Default('general') String purpose,
    @Default(false) bool isDefault,
    @Default(0) double monthlyCost,
    TwilioNumberCapabilities? capabilities,
    String? createdAt,
    String? updatedAt,
  }) = _TwilioNumberModel;

  factory TwilioNumberModel.fromJson(Map<String, dynamic> json) =>
      _$TwilioNumberModelFromJson(json);
}

@freezed
abstract class TwilioNumberCapabilities with _$TwilioNumberCapabilities {
  const factory TwilioNumberCapabilities({
    @Default(false) bool voice,
    @Default(false) bool sms,
    @Default(false) bool mms,
  }) = _TwilioNumberCapabilities;

  factory TwilioNumberCapabilities.fromJson(Map<String, dynamic> json) =>
      _$TwilioNumberCapabilitiesFromJson(json);
}

@freezed
abstract class AvailableNumber with _$AvailableNumber {
  const factory AvailableNumber({
    required String phoneNumber,
    String? friendlyName,
    String? locality,
    String? region,
    TwilioNumberCapabilities? capabilities,
  }) = _AvailableNumber;

  factory AvailableNumber.fromJson(Map<String, dynamic> json) =>
      _$AvailableNumberFromJson(json);
}
