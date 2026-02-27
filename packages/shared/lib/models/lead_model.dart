import 'dart:convert';

import 'package:freezed_annotation/freezed_annotation.dart';

part 'lead_model.freezed.dart';
part 'lead_model.g.dart';

// ── Destination JSON converter ────────────────────────────────
// Backend stores destinations as a JSON string in `destination` column.
// e.g.  '["Bali","Singapore"]'  →  ["Bali", "Singapore"]

class _DestinationsConverter implements JsonConverter<List<String>, Object?> {
  const _DestinationsConverter();

  @override
  List<String> fromJson(Object? json) {
    if (json == null || json == '') return [];
    if (json is List) return json.cast<String>();
    if (json is String && json.isNotEmpty) {
      try {
        final decoded = jsonDecode(json);
        if (decoded is List) return decoded.cast<String>();
      } catch (_) {}
    }
    return [];
  }

  @override
  Object? toJson(List<String> destinations) => jsonEncode(destinations);
}

// ── LeadModel ─────────────────────────────────────────────────

@freezed
abstract class LeadModel with _$LeadModel {
  const factory LeadModel({
    required String id,
    required String contactId,
    String? contactName,
    required String title,
    // destinations is returned as a parsed array from the backend
    @_DestinationsConverter() @JsonKey(name: 'destinations') @Default([]) List<String> destinations,
    required String travelDate,
    String? returnDate,
    @Default(1) int paxAdults,
    @Default(0) int paxChildren,
    @Default(0) int paxInfants,
    double? budget,
    @Default('INR') String currency,
    required String tripType,
    String? source,
    @Default('new') String status,
    String? priority,
    String? assignedTo,
    String? assignedToName,
    String? lostReason,
    bool? passportAvailable,
    String? travelClass,
    String? hotelPreference,
    String? mealPreference,
    String? specialRequirements,
    String? notes,
    String? createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
    int? leadsCount,
  }) = _LeadModel;

  factory LeadModel.fromJson(Map<String, dynamic> json) =>
      _$LeadModelFromJson(json);
}

// ── LeadActivity ──────────────────────────────────────────────

@freezed
abstract class LeadActivity with _$LeadActivity {
  const factory LeadActivity({
    required String id,
    required String leadId,
    required String type,
    String? content,
    String? metadata, // raw JSON string
    String? createdBy,
    String? createdByName,
    String? createdAt,
  }) = _LeadActivity;

  factory LeadActivity.fromJson(Map<String, dynamic> json) =>
      _$LeadActivityFromJson(json);
}

// ── Pipeline ──────────────────────────────────────────────────

@freezed
abstract class PipelineStage with _$PipelineStage {
  const factory PipelineStage({
    required String name,
    required String label,
    @Default(0) int count,
    @Default(0.0) double totalValue,
    @Default([]) List<LeadModel> leads,
  }) = _PipelineStage;

  factory PipelineStage.fromJson(Map<String, dynamic> json) =>
      _$PipelineStageFromJson(json);
}

@freezed
abstract class PipelineData with _$PipelineData {
  const factory PipelineData({
    @Default([]) List<PipelineStage> stages,
  }) = _PipelineData;

  factory PipelineData.fromJson(Map<String, dynamic> json) =>
      _$PipelineDataFromJson(json);
}

// ── Dashboard Stats ───────────────────────────────────────────

@freezed
abstract class LeadDashboardStats with _$LeadDashboardStats {
  const factory LeadDashboardStats({
    @Default({}) Map<String, int> pipelineCounts,
    @Default([]) List<LeadModel> hotLeads,
    @Default(0) int todayFollowUpCount,
    @Default(0) int overdueFollowUpCount,
    @Default([]) List<LeadActivity> recentActivities,
  }) = _LeadDashboardStats;

  factory LeadDashboardStats.fromJson(Map<String, dynamic> json) =>
      _$LeadDashboardStatsFromJson(json);
}

// ── Lead Filter Options ───────────────────────────────────────

@freezed
abstract class LeadFilterOptions with _$LeadFilterOptions {
  const factory LeadFilterOptions({
    @Default([]) List<String> destinations,
    @Default([]) List<String> tripTypes,
    @Default([]) List<String> sources,
    @Default([]) List<Map<String, String>> assignees,
  }) = _LeadFilterOptions;

  factory LeadFilterOptions.fromJson(Map<String, dynamic> json) =>
      _$LeadFilterOptionsFromJson(json);
}

// ── LeadStatus helper ─────────────────────────────────────────
// Dart enum for pipeline stages. 'new' is a reserved word, so use 'new_'.

enum LeadStatus {
  new_,
  contacted,
  requirementGathered,
  proposalSent,
  negotiation,
  bookingConfirmed,
  completed,
  lost;

  /// The value sent to / received from the API.
  String get apiValue => switch (this) {
        new_ => 'new',
        contacted => 'contacted',
        requirementGathered => 'requirement_gathered',
        proposalSent => 'proposal_sent',
        negotiation => 'negotiation',
        bookingConfirmed => 'booking_confirmed',
        completed => 'completed',
        lost => 'lost',
      };

  /// Human-readable label for UI.
  String get label => switch (this) {
        new_ => 'New',
        contacted => 'Contacted',
        requirementGathered => 'Requirement Gathered',
        proposalSent => 'Proposal Sent',
        negotiation => 'Negotiation',
        bookingConfirmed => 'Booking Confirmed',
        completed => 'Completed',
        lost => 'Lost',
      };

  static LeadStatus fromApiValue(String v) => LeadStatus.values.firstWhere(
        (s) => s.apiValue == v,
        orElse: () => LeadStatus.new_,
      );
}
