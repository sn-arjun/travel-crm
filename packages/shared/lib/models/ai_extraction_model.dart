import 'package:freezed_annotation/freezed_annotation.dart';

part 'ai_extraction_model.freezed.dart';
part 'ai_extraction_model.g.dart';

@freezed
abstract class AiExtractionModel with _$AiExtractionModel {
  const factory AiExtractionModel({
    required String id,
    required String callLogId,
    String? transcriptId,
    String? destination,
    TravelDates? travelDates,
    int? paxCount,
    List<PaxDetail>? paxDetails,
    double? budget,
    String? budgetCurrency,
    @Default([]) List<String> preferences,
    String? tripType,
    String? hotelPreference,
    String? mealPreference,
    String? specialRequests,
    @Default([]) List<String> summary,
    @Default([]) List<String> keyTopics,
    @Default([]) List<ActionItem> actionItems,
    String? sentiment,
    double? sentimentScore,
    double? dealLikelihood,
    @Default([]) List<String> likelihoodSignals,
    @Default([]) List<String> coachingHints,
    double? overallConfidence,
    @Default({}) Map<String, double> fieldConfidences,
    required String status,
    String? reviewedBy,
    String? reviewedAt,
    String? createdLeadId,
    String? createdContactId,
    String? modelUsed,
    int? tokensUsed,
    double? costEstimate,
    // Joined fields
    String? contactName,
    String? fromNumber,
    String? toNumber,
    String? direction,
    String? createdAt,
    String? updatedAt,
  }) = _AiExtractionModel;

  factory AiExtractionModel.fromJson(Map<String, dynamic> json) =>
      _$AiExtractionModelFromJson(json);
}

@freezed
abstract class TravelDates with _$TravelDates {
  const factory TravelDates({
    String? from,
    String? to,
    @Default(false) bool flexible,
  }) = _TravelDates;

  factory TravelDates.fromJson(Map<String, dynamic> json) =>
      _$TravelDatesFromJson(json);
}

@freezed
abstract class PaxDetail with _$PaxDetail {
  const factory PaxDetail({
    String? type,
    int? count,
    String? name,
    int? age,
  }) = _PaxDetail;

  factory PaxDetail.fromJson(Map<String, dynamic> json) =>
      _$PaxDetailFromJson(json);
}

@freezed
abstract class ActionItem with _$ActionItem {
  const factory ActionItem({
    required String text,
    String? assignee,
    String? dueDate,
    String? priority,
  }) = _ActionItem;

  factory ActionItem.fromJson(Map<String, dynamic> json) =>
      _$ActionItemFromJson(json);
}

@freezed
abstract class ExtractionConfirmRequest with _$ExtractionConfirmRequest {
  const factory ExtractionConfirmRequest({
    String? destination,
    TravelDates? travelDates,
    int? paxCount,
    double? budget,
    String? tripType,
  }) = _ExtractionConfirmRequest;

  factory ExtractionConfirmRequest.fromJson(Map<String, dynamic> json) =>
      _$ExtractionConfirmRequestFromJson(json);
}

@freezed
abstract class AiUsageSummary with _$AiUsageSummary {
  const factory AiUsageSummary({
    required String period,
    required double totalCost,
    required int totalRequests,
    @Default([]) List<AiUsageBreakdown> breakdown,
  }) = _AiUsageSummary;

  factory AiUsageSummary.fromJson(Map<String, dynamic> json) =>
      _$AiUsageSummaryFromJson(json);
}

@freezed
abstract class AiUsageBreakdown with _$AiUsageBreakdown {
  const factory AiUsageBreakdown({
    required String taskType,
    required String modelName,
    required int requestCount,
    int? totalInputTokens,
    int? totalOutputTokens,
    required double totalCost,
    int? successCount,
    int? avgDurationMs,
  }) = _AiUsageBreakdown;

  factory AiUsageBreakdown.fromJson(Map<String, dynamic> json) =>
      _$AiUsageBreakdownFromJson(json);
}
