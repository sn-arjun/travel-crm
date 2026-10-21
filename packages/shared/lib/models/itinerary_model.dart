import 'package:freezed_annotation/freezed_annotation.dart';

part 'itinerary_model.freezed.dart';
part 'itinerary_model.g.dart';

// ── Helper: backend stores booleans as INTEGER (0/1) ─────────
bool _intOrBoolToBool(dynamic value) {
  if (value is bool) return value;
  if (value is int) return value != 0;
  return false;
}

// ── ItineraryItemModel ───────────────────────────────────────

@freezed
abstract class ItineraryItemModel with _$ItineraryItemModel {
  const factory ItineraryItemModel({
    required String id,
    required String type,
    required String title,
    String? description,
    String? supplierId,
    String? rateCardId,
    @Default(0.0) double costPrice,
    @Default(0.0) double sellingPrice,
    String? markupType,
    double? markupValue,
    @Default(0.0) double taxRate,
    @Default(0.0) double taxAmount,
    @Default(1) int quantity,
    String? paxType,
    String? timeStart,
    String? timeEnd,
    @Default(0) int sortOrder,
    Map<String, dynamic>? detailsJson,
    String? internalNotes,
  }) = _ItineraryItemModel;

  factory ItineraryItemModel.fromJson(Map<String, dynamic> json) =>
      _$ItineraryItemModelFromJson(json);
}

// ── ItineraryDayModel ────────────────────────────────────────

@freezed
abstract class ItineraryDayModel with _$ItineraryDayModel {
  const factory ItineraryDayModel({
    required String id,
    required int dayNumber,
    String? title,
    String? description,
    String? city,
    String? overnightCity,
    @Default([]) List<String> images,
    @JsonKey(fromJson: _intOrBoolToBool) @Default(false) bool isFreeDay,
    @Default([]) List<ItineraryItemModel> items,
  }) = _ItineraryDayModel;

  factory ItineraryDayModel.fromJson(Map<String, dynamic> json) =>
      _$ItineraryDayModelFromJson(json);
}

// ── ItineraryModel ───────────────────────────────────────────

@freezed
abstract class ItineraryModel with _$ItineraryModel {
  const factory ItineraryModel({
    required String id,
    required String leadId,
    required String title,
    @Default(1) int version,
    String? parentId,
    @Default('draft') String status,
    String? validityDate,
    String? notes,
    @Default([]) List<String> inclusions,
    @Default([]) List<String> exclusions,
    String? termsConditions,
    // The agency's currency as the server sent it; null when it did not.
    String? currency,
    @Default(0.0) double totalCost,
    @Default(0.0) double totalSelling,
    @Default(0.0) double totalTax,
    @Default(0.0) double grandTotal,
    String? markupType,
    double? markupValue,
    String? shareToken,
    @JsonKey(fromJson: _intOrBoolToBool) @Default(false) bool shareLinkActive,
    @Default(0) int viewCount,
    String? lastViewedAt,
    @JsonKey(fromJson: _intOrBoolToBool) @Default(false) bool isDeleted,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
    @Default([]) List<ItineraryDayModel> days,
    Map<String, dynamic>? lead,
    Map<String, dynamic>? contact,
  }) = _ItineraryModel;

  factory ItineraryModel.fromJson(Map<String, dynamic> json) =>
      _$ItineraryModelFromJson(json);
}

// ── ItinerarySummary ─────────────────────────────────────────

@freezed
abstract class ItinerarySummary with _$ItinerarySummary {
  const factory ItinerarySummary({
    required String id,
    required String leadId,
    required String title,
    @Default(1) int version,
    @Default('draft') String status,
    // The agency's currency as the server sent it; null when it did not.
    String? currency,
    double? totalCost,
    double? totalSelling,
    double? grandTotal,
    String? createdBy,
    String? createdAt,
    String? leadTitle,
    String? contactName,
    int? daysCount,
  }) = _ItinerarySummary;

  factory ItinerarySummary.fromJson(Map<String, dynamic> json) =>
      _$ItinerarySummaryFromJson(json);
}
