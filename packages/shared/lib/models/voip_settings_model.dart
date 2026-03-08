import 'package:freezed_annotation/freezed_annotation.dart';

part 'voip_settings_model.freezed.dart';
part 'voip_settings_model.g.dart';

@freezed
abstract class VoipSettingsModel with _$VoipSettingsModel {
  const factory VoipSettingsModel({
    required String id,
    @Default('twilio') String voipProvider,
    // Generic provider credentials
    String? providerAccountId,
    String? providerAuthToken,
    String? providerApiKeyId,
    String? providerApiKeySecret,
    String? providerAppId,
    // Legacy Twilio-specific
    String? twilioAccountSid,
    String? twilioAuthToken,
    String? twilioApiKeySid,
    String? twilioApiKeySecret,
    String? twilioTwimlAppSid,
    // Common settings
    String? defaultCallerId,
    @Default('all') String recordingPolicy,
    @Default(false) bool ivrEnabled,
    IvrConfig? ivrConfig,
    @Default(false) bool businessHoursEnabled,
    BusinessHoursConfig? businessHours,
    @Default(true) bool voicemailEnabled,
    String? voicemailGreetingUrl,
    @Default(30) int maxRingDuration,
    @Default('assigned') String routingStrategy,
    String? createdAt,
    String? updatedAt,
  }) = _VoipSettingsModel;

  factory VoipSettingsModel.fromJson(Map<String, dynamic> json) =>
      _$VoipSettingsModelFromJson(json);
}

@freezed
abstract class IvrConfig with _$IvrConfig {
  const factory IvrConfig({
    required String greeting,
    @Default([]) List<IvrOption> options,
  }) = _IvrConfig;

  factory IvrConfig.fromJson(Map<String, dynamic> json) =>
      _$IvrConfigFromJson(json);
}

@freezed
abstract class IvrOption with _$IvrOption {
  const factory IvrOption({
    required String digit,
    required String label,
    required String action,
    required String target,
  }) = _IvrOption;

  factory IvrOption.fromJson(Map<String, dynamic> json) =>
      _$IvrOptionFromJson(json);
}

@freezed
abstract class BusinessHoursConfig with _$BusinessHoursConfig {
  const factory BusinessHoursConfig({
    required String timezone,
    required Map<String, DaySchedule> schedule,
  }) = _BusinessHoursConfig;

  factory BusinessHoursConfig.fromJson(Map<String, dynamic> json) =>
      _$BusinessHoursConfigFromJson(json);
}

@freezed
abstract class DaySchedule with _$DaySchedule {
  const factory DaySchedule({
    required String start,
    required String end,
    @Default(true) bool enabled,
  }) = _DaySchedule;

  factory DaySchedule.fromJson(Map<String, dynamic> json) =>
      _$DayScheduleFromJson(json);
}

@freezed
abstract class VoipTokenResponse with _$VoipTokenResponse {
  const factory VoipTokenResponse({
    required String token,
    required String identity,
    required String expiresAt,
    @Default('twilio') String provider,
  }) = _VoipTokenResponse;

  factory VoipTokenResponse.fromJson(Map<String, dynamic> json) =>
      _$VoipTokenResponseFromJson(json);
}

@freezed
abstract class VoipConnectionTestResult with _$VoipConnectionTestResult {
  const factory VoipConnectionTestResult({
    required bool connected,
    String? accountName,
    String? accountStatus,
    String? error,
  }) = _VoipConnectionTestResult;

  factory VoipConnectionTestResult.fromJson(Map<String, dynamic> json) =>
      _$VoipConnectionTestResultFromJson(json);
}
