import 'package:freezed_annotation/freezed_annotation.dart';

part 'whatsapp_campaign_model.freezed.dart';
part 'whatsapp_campaign_model.g.dart';

@freezed
abstract class WhatsAppCampaignModel with _$WhatsAppCampaignModel {
  const factory WhatsAppCampaignModel({
    required String id,
    required String name,
    required String status,
    String? templateName,
    required String templateContent,
    Map<String, dynamic>? templateVariables,
    Map<String, dynamic>? audienceFilter,
    @Default(0) int totalRecipients,
    @Default(0) int sentCount,
    @Default(0) int deliveredCount,
    @Default(0) int readCount,
    @Default(0) int failedCount,
    @Default(0) int optedOutCount,
    String? scheduledAt,
    String? startedAt,
    String? completedAt,
    String? createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
  }) = _WhatsAppCampaignModel;

  factory WhatsAppCampaignModel.fromJson(Map<String, dynamic> json) =>
      _$WhatsAppCampaignModelFromJson(json);
}

@freezed
abstract class WhatsAppRecipientModel with _$WhatsAppRecipientModel {
  const factory WhatsAppRecipientModel({
    required String id,
    String? contactId,
    required String phone,
    String? name,
    required String status,
    String? providerMessageId,
    String? errorMessage,
    String? sentAt,
    String? deliveredAt,
    String? readAt,
  }) = _WhatsAppRecipientModel;

  factory WhatsAppRecipientModel.fromJson(Map<String, dynamic> json) =>
      _$WhatsAppRecipientModelFromJson(json);
}

@freezed
abstract class CampaignAnalytics with _$CampaignAnalytics {
  const factory CampaignAnalytics({
    required String campaignId,
    required String status,
    @Default(0) int totalRecipients,
    @Default({}) Map<String, int> statusBreakdown,
    required CampaignRates rates,
  }) = _CampaignAnalytics;

  factory CampaignAnalytics.fromJson(Map<String, dynamic> json) =>
      _$CampaignAnalyticsFromJson(json);
}

@freezed
abstract class CampaignRates with _$CampaignRates {
  const factory CampaignRates({
    @Default(0) int sendRate,
    @Default(0) int deliveryRate,
    @Default(0) int readRate,
    @Default(0) int failRate,
    @Default(0) int optOutRate,
  }) = _CampaignRates;

  factory CampaignRates.fromJson(Map<String, dynamic> json) =>
      _$CampaignRatesFromJson(json);
}
