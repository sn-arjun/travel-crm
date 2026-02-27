import 'package:freezed_annotation/freezed_annotation.dart';

part 'marketing_campaign_model.freezed.dart';
part 'marketing_campaign_model.g.dart';

@freezed
abstract class MarketingCampaignModel with _$MarketingCampaignModel {
  const factory MarketingCampaignModel({
    required String id,
    String? tenantId,
    required String name,
    required String type,
    String? segmentId,
    String? templateId,
    String? templateVariables,
    String? messageBody,
    String? emailSubject,
    @Default('draft') String status,
    String? scheduledAt,
    @Default(0) int totalRecipients,
    @Default(0) int sentCount,
    @Default(0) int deliveredCount,
    @Default(0) int failedCount,
    @Default(0) int openedCount,
    @Default(0) int clickedCount,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _MarketingCampaignModel;

  factory MarketingCampaignModel.fromJson(Map<String, dynamic> json) =>
      _$MarketingCampaignModelFromJson(json);
}

@freezed
abstract class CampaignRecipientModel with _$CampaignRecipientModel {
  const factory CampaignRecipientModel({
    required String id,
    required String campaignId,
    String? contactId,
    String? contactName,
    String? phone,
    String? email,
    @Default('pending') String status,
    String? errorMessage,
    String? sentAt,
    String? deliveredAt,
    String? createdAt,
  }) = _CampaignRecipientModel;

  factory CampaignRecipientModel.fromJson(Map<String, dynamic> json) =>
      _$CampaignRecipientModelFromJson(json);
}

@freezed
abstract class CampaignAnalyticsModel with _$CampaignAnalyticsModel {
  const factory CampaignAnalyticsModel({
    required String campaignId,
    String? name,
    String? type,
    String? status,
    @Default(0) int totalRecipients,
    @Default(0) int sent,
    @Default(0) int delivered,
    @Default(0) int failed,
    @Default(0) int optedOut,
    @Default(0) int pending,
    @Default('0.0') String deliveryRate,
    @Default(0) int opened,
    @Default(0) int clicked,
  }) = _CampaignAnalyticsModel;

  factory CampaignAnalyticsModel.fromJson(Map<String, dynamic> json) =>
      _$CampaignAnalyticsModelFromJson(json);
}
