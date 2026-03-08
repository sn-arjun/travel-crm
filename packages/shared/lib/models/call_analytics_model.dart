import 'package:freezed_annotation/freezed_annotation.dart';

part 'call_analytics_model.freezed.dart';
part 'call_analytics_model.g.dart';

@freezed
abstract class CallAnalyticsModel with _$CallAnalyticsModel {
  const factory CallAnalyticsModel({
    required CallAnalyticsSummary summary,
    @Default([]) List<DailyCallData> dailyCalls,
    @Default([]) List<AgentCallData> topAgents,
    @Default([]) List<OutcomeData> outcomes,
    @Default([]) List<HourlyData> hourlyDistribution,
  }) = _CallAnalyticsModel;

  factory CallAnalyticsModel.fromJson(Map<String, dynamic> json) =>
      _$CallAnalyticsModelFromJson(json);
}

@freezed
abstract class CallAnalyticsSummary with _$CallAnalyticsSummary {
  const factory CallAnalyticsSummary({
    @Default(0) int totalCalls,
    @Default(0) int inboundCalls,
    @Default(0) int outboundCalls,
    @Default(0) int completedCalls,
    @Default(0) int missedCalls,
    @Default(0) double avgDurationSeconds,
    @Default(0) int totalDurationSeconds,
    @Default(0) int interestedCount,
    @Default(0) int followUpCount,
    @Default(0) int successRate,
  }) = _CallAnalyticsSummary;

  factory CallAnalyticsSummary.fromJson(Map<String, dynamic> json) =>
      _$CallAnalyticsSummaryFromJson(json);
}

@freezed
abstract class DailyCallData with _$DailyCallData {
  const factory DailyCallData({
    required String date,
    @Default(0) int total,
    @Default(0) int inbound,
    @Default(0) int outbound,
  }) = _DailyCallData;

  factory DailyCallData.fromJson(Map<String, dynamic> json) =>
      _$DailyCallDataFromJson(json);
}

@freezed
abstract class AgentCallData with _$AgentCallData {
  const factory AgentCallData({
    required String userId,
    required String name,
    @Default(0) int totalCalls,
    @Default(0) int completed,
    @Default(0) double avgDuration,
  }) = _AgentCallData;

  factory AgentCallData.fromJson(Map<String, dynamic> json) =>
      _$AgentCallDataFromJson(json);
}

@freezed
abstract class OutcomeData with _$OutcomeData {
  const factory OutcomeData({
    required String outcome,
    @Default(0) int count,
  }) = _OutcomeData;

  factory OutcomeData.fromJson(Map<String, dynamic> json) =>
      _$OutcomeDataFromJson(json);
}

@freezed
abstract class HourlyData with _$HourlyData {
  const factory HourlyData({
    required int hour,
    @Default(0) int count,
  }) = _HourlyData;

  factory HourlyData.fromJson(Map<String, dynamic> json) =>
      _$HourlyDataFromJson(json);
}
