import 'package:freezed_annotation/freezed_annotation.dart';

part 'business_intelligence_model.freezed.dart';
part 'business_intelligence_model.g.dart';

@freezed
abstract class AiBriefingModel with _$AiBriefingModel {
  const factory AiBriefingModel({
    required String id,
    String? userId,
    required String briefingType,
    required String title,
    required String content, // JSON sections
    String? metrics,
    String? highlights,
    required String period,
    @Default(false) bool delivered,
    String? deliveredVia,
    String? readAt,
    String? modelUsed,
    @Default(0) double costEstimate,
    String? createdAt,
  }) = _AiBriefingModel;

  factory AiBriefingModel.fromJson(Map<String, dynamic> json) =>
      _$AiBriefingModelFromJson(json);
}

@freezed
abstract class BusinessHealthScoreModel with _$BusinessHealthScoreModel {
  const factory BusinessHealthScoreModel({
    required String id,
    required int overallScore,
    int? revenueScore,
    int? pipelineScore,
    int? customerScore,
    int? teamScore,
    int? operationsScore,
    String? breakdown,
    String? trends,
    String? alerts,
    String? recommendations,
    int? previousScore,
    int? scoreChange,
    String? modelUsed,
    @Default(0) double costEstimate,
    String? calculatedAt,
    String? createdAt,
  }) = _BusinessHealthScoreModel;

  factory BusinessHealthScoreModel.fromJson(Map<String, dynamic> json) =>
      _$BusinessHealthScoreModelFromJson(json);
}

@freezed
abstract class CustomerSegmentModel with _$CustomerSegmentModel {
  const factory CustomerSegmentModel({
    required String id,
    required String contactId,
    required String segment,
    double? confidence,
    String? signals,
    double? lifetimeValue,
    double? churnRisk,
    String? nextTripPrediction,
    String? preferredDestinations,
    String? preferredChannel,
    String? contactName,
    String? contactEmail,
    String? lastCalculatedAt,
    String? createdAt,
    String? updatedAt,
  }) = _CustomerSegmentModel;

  factory CustomerSegmentModel.fromJson(Map<String, dynamic> json) =>
      _$CustomerSegmentModelFromJson(json);
}

@freezed
abstract class DestinationProfitability with _$DestinationProfitability {
  const factory DestinationProfitability({
    List<Map<String, dynamic>>? destinations,
    String? topPerformer,
    String? underPerformer,
    List<String>? insights,
    List<Map<String, dynamic>>? rawData,
  }) = _DestinationProfitability;

  factory DestinationProfitability.fromJson(Map<String, dynamic> json) =>
      _$DestinationProfitabilityFromJson(json);
}

@freezed
abstract class SeasonalDemand with _$SeasonalDemand {
  const factory SeasonalDemand({
    List<String>? peakMonths,
    List<String>? slowMonths,
    List<Map<String, dynamic>>? forecast,
    List<Map<String, dynamic>>? destinationSeasonality,
    List<String>? recommendations,
  }) = _SeasonalDemand;

  factory SeasonalDemand.fromJson(Map<String, dynamic> json) =>
      _$SeasonalDemandFromJson(json);
}

@freezed
abstract class RevenuePulse with _$RevenuePulse {
  const factory RevenuePulse({
    @Default(0) double currentMonthRevenue,
    @Default(0) double lastMonthRevenue,
    @Default(0) double momChange,
    @Default(0) double pipelineValue,
    @Default(0) double avgDealSize,
  }) = _RevenuePulse;

  factory RevenuePulse.fromJson(Map<String, dynamic> json) =>
      _$RevenuePulseFromJson(json);
}

@freezed
abstract class TrendingDestination with _$TrendingDestination {
  const factory TrendingDestination({
    required String destination,
    @Default(0) int currentCount,
    @Default(0) int previousCount,
    @Default('0.0') String growth,
  }) = _TrendingDestination;

  factory TrendingDestination.fromJson(Map<String, dynamic> json) =>
      _$TrendingDestinationFromJson(json);
}

@freezed
abstract class BiUsageSummary with _$BiUsageSummary {
  const factory BiUsageSummary({
    required String period,
    Map<String, dynamic>? summary,
    List<Map<String, dynamic>>? byTask,
    List<Map<String, dynamic>>? byModel,
    List<Map<String, dynamic>>? daily,
  }) = _BiUsageSummary;

  factory BiUsageSummary.fromJson(Map<String, dynamic> json) =>
      _$BiUsageSummaryFromJson(json);
}

@freezed
abstract class LeadSourceRoi with _$LeadSourceRoi {
  const factory LeadSourceRoi({
    required String source,
    @Default(0) int totalLeads,
    @Default(0) int wonLeads,
    @Default(0) int lostLeads,
    @Default(0) double totalRevenue,
    @Default(0) double avgDealSize,
    @Default('0.0') String conversionRate,
  }) = _LeadSourceRoi;

  factory LeadSourceRoi.fromJson(Map<String, dynamic> json) =>
      _$LeadSourceRoiFromJson(json);
}

@freezed
abstract class WorkloadAnalysis with _$WorkloadAnalysis {
  const factory WorkloadAnalysis({
    List<Map<String, dynamic>>? users,
    @Default(0) double avgLeadsPerUser,
    @Default(0) int totalActiveLeads,
    @Default([]) List<String> alerts,
  }) = _WorkloadAnalysis;

  factory WorkloadAnalysis.fromJson(Map<String, dynamic> json) =>
      _$WorkloadAnalysisFromJson(json);
}
