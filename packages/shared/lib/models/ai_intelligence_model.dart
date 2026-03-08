import 'package:freezed_annotation/freezed_annotation.dart';

part 'ai_intelligence_model.freezed.dart';
part 'ai_intelligence_model.g.dart';

// ─── NL Query ──────────────────────────────────────────────

@freezed
abstract class AiNlQueryModel with _$AiNlQueryModel {
  const factory AiNlQueryModel({
    required String id,
    required String query,
    String? sql,
    Object? result,
    String? narrative,
    List<String>? entityTypes,
    String? model,
    double? cost,
    int? durationMs,
    String? status,
    String? errorMessage,
    String? createdAt,
  }) = _AiNlQueryModel;

  factory AiNlQueryModel.fromJson(Map<String, dynamic> json) =>
      _$AiNlQueryModelFromJson(json);
}

// ─── AI Insight ────────────────────────────────────────────

@freezed
abstract class AiInsightModel with _$AiInsightModel {
  const factory AiInsightModel({
    required String id,
    String? userId,
    required String insightType,
    String? entityType,
    String? entityId,
    required String title,
    required String summary,
    Object? data,
    double? confidence,
    @Default('medium') String priority,
    @Default(false) bool actionable,
    @Default(false) bool actionTaken,
    String? dismissedAt,
    String? expiresAt,
    String? modelUsed,
    double? costEstimate,
    String? createdAt,
    String? updatedAt,
  }) = _AiInsightModel;

  factory AiInsightModel.fromJson(Map<String, dynamic> json) =>
      _$AiInsightModelFromJson(json);
}

// ─── AI Recommendation ────────────────────────────────────

@freezed
abstract class AiRecommendationModel with _$AiRecommendationModel {
  const factory AiRecommendationModel({
    required String id,
    String? userId,
    required String recommendationType,
    String? entityType,
    String? entityId,
    required String title,
    required String description,
    String? reasoning,
    double? impactScore,
    double? confidenceScore,
    String? actionUrl,
    @Default('active') String status,
    String? dismissedAt,
    String? actedOnAt,
    String? expiresAt,
    String? modelUsed,
    double? costEstimate,
    String? createdAt,
  }) = _AiRecommendationModel;

  factory AiRecommendationModel.fromJson(Map<String, dynamic> json) =>
      _$AiRecommendationModelFromJson(json);
}

// ─── AI Lead Score ─────────────────────────────────────────

@freezed
abstract class AiLeadScoreModel with _$AiLeadScoreModel {
  const factory AiLeadScoreModel({
    required String id,
    required String leadId,
    required int score,
    required String category,
    List<ScoreSignal>? signals,
    Map<String, dynamic>? breakdown,
    int? previousScore,
    int? scoreChange,
    String? triggerEvent,
    String? modelUsed,
    double? costEstimate,
    String? calculatedAt,
  }) = _AiLeadScoreModel;

  factory AiLeadScoreModel.fromJson(Map<String, dynamic> json) =>
      _$AiLeadScoreModelFromJson(json);
}

@freezed
abstract class ScoreSignal with _$ScoreSignal {
  const factory ScoreSignal({
    required String name,
    required double value,
    required double weight,
    required double contribution,
  }) = _ScoreSignal;

  factory ScoreSignal.fromJson(Map<String, dynamic> json) =>
      _$ScoreSignalFromJson(json);
}

// ─── AI Document Scan ──────────────────────────────────────

@freezed
abstract class AiDocumentScanModel with _$AiDocumentScanModel {
  const factory AiDocumentScanModel({
    required String id,
    required String documentType,
    String? imageUrl,
    Object? extractedData,
    double? confidence,
    String? entityType,
    String? entityId,
    @Default('pending') String status,
    String? modelUsed,
    int? inputTokens,
    int? outputTokens,
    double? costEstimate,
    String? createdAt,
    String? updatedAt,
  }) = _AiDocumentScanModel;

  factory AiDocumentScanModel.fromJson(Map<String, dynamic> json) =>
      _$AiDocumentScanModelFromJson(json);
}

// ─── AI Follow-up Suggestion ──────────────────────────────

@freezed
abstract class AiFollowUpSuggestionModel with _$AiFollowUpSuggestionModel {
  const factory AiFollowUpSuggestionModel({
    required String id,
    String? userId,
    String? leadId,
    String? contactId,
    String? suggestedChannel,
    String? suggestedTiming,
    String? timingReasoning,
    String? channelReasoning,
    String? messageContent,
    @Default(0) int escalationLevel,
    @Default(false) bool isWinBack,
    double? confidenceScore,
    @Default('pending') String status,
    String? sentAt,
    String? dismissedAt,
    String? modelUsed,
    double? costEstimate,
    String? createdAt,
  }) = _AiFollowUpSuggestionModel;

  factory AiFollowUpSuggestionModel.fromJson(Map<String, dynamic> json) =>
      _$AiFollowUpSuggestionModelFromJson(json);
}

// ─── Customer Insight Result ──────────────────────────────

@freezed
abstract class CustomerInsightResult with _$CustomerInsightResult {
  const factory CustomerInsightResult({
    required String id,
    String? summary,
    List<String>? upsellOpportunities,
    List<String>? riskSignals,
    List<String>? recommendations,
    double? lifetimeValue,
    String? engagementLevel,
    String? model,
    double? cost,
  }) = _CustomerInsightResult;

  factory CustomerInsightResult.fromJson(Map<String, dynamic> json) =>
      _$CustomerInsightResultFromJson(json);
}

// ─── Trend Detection Result ───────────────────────────────

@freezed
abstract class TrendDetectionResult with _$TrendDetectionResult {
  const factory TrendDetectionResult({
    List<TrendItem>? trends,
    List<AnomalyItem>? anomalies,
    List<TrendRecommendation>? recommendations,
    String? model,
    double? cost,
  }) = _TrendDetectionResult;

  factory TrendDetectionResult.fromJson(Map<String, dynamic> json) =>
      _$TrendDetectionResultFromJson(json);
}

@freezed
abstract class TrendItem with _$TrendItem {
  const factory TrendItem({
    required String metric,
    required String direction,
    double? change,
    String? description,
  }) = _TrendItem;

  factory TrendItem.fromJson(Map<String, dynamic> json) =>
      _$TrendItemFromJson(json);
}

@freezed
abstract class AnomalyItem with _$AnomalyItem {
  const factory AnomalyItem({
    required String metric,
    double? deviation,
    String? severity,
    String? description,
  }) = _AnomalyItem;

  factory AnomalyItem.fromJson(Map<String, dynamic> json) =>
      _$AnomalyItemFromJson(json);
}

@freezed
abstract class TrendRecommendation with _$TrendRecommendation {
  const factory TrendRecommendation({
    required String action,
    String? reasoning,
    String? priority,
  }) = _TrendRecommendation;

  factory TrendRecommendation.fromJson(Map<String, dynamic> json) =>
      _$TrendRecommendationFromJson(json);
}
