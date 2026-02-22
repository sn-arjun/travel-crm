import 'package:freezed_annotation/freezed_annotation.dart';

part 'contact_model.freezed.dart';
part 'contact_model.g.dart';

@freezed
abstract class ContactModel with _$ContactModel {
  const factory ContactModel({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? company,
    required String type,
    String? address,
    String? city,
    String? state,
    String? country,
    String? postalCode,
    @Default([]) List<String> tags,
    String? notes,
    String? source,
    String? birthday,
    String? anniversary,
    @Default('en') String preferredLanguage,
    String? createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
    int? leadsCount,
    int? invoicesCount,
    int? paymentsTotal,
    Map<String, dynamic>? customFields,
  }) = _ContactModel;

  factory ContactModel.fromJson(Map<String, dynamic> json) =>
      _$ContactModelFromJson(json);
}

@freezed
abstract class ContactListResponse with _$ContactListResponse {
  const factory ContactListResponse({
    required List<ContactModel> data,
    required PaginationMeta pagination,
  }) = _ContactListResponse;

  factory ContactListResponse.fromJson(Map<String, dynamic> json) =>
      _$ContactListResponseFromJson(json);
}

@freezed
abstract class PaginationMeta with _$PaginationMeta {
  const factory PaginationMeta({
    required int total,
    required int page,
    required int limit,
    required int totalPages,
    @Default(false) bool hasMore,
  }) = _PaginationMeta;

  factory PaginationMeta.fromJson(Map<String, dynamic> json) =>
      _$PaginationMetaFromJson(json);
}

@freezed
abstract class ContactDuplicateCheck with _$ContactDuplicateCheck {
  const factory ContactDuplicateCheck({
    @Default(false) bool hasDuplicates,
    @Default([]) List<ContactModel> matches,
  }) = _ContactDuplicateCheck;

  factory ContactDuplicateCheck.fromJson(Map<String, dynamic> json) =>
      _$ContactDuplicateCheckFromJson(json);
}

@freezed
abstract class ContactFilterOptions with _$ContactFilterOptions {
  const factory ContactFilterOptions({
    @Default([]) List<String> types,
    @Default([]) List<String> sources,
    @Default([]) List<String> cities,
    @Default([]) List<String> countries,
    @Default([]) List<String> tags,
    @Default([]) List<String> languages,
  }) = _ContactFilterOptions;

  factory ContactFilterOptions.fromJson(Map<String, dynamic> json) =>
      _$ContactFilterOptionsFromJson(json);
}

@freezed
abstract class TimelineEntry with _$TimelineEntry {
  const factory TimelineEntry({
    required String id,
    required String type,
    required String title,
    String? description,
    String? metadata,
    required String createdAt,
    String? createdByName,
  }) = _TimelineEntry;

  factory TimelineEntry.fromJson(Map<String, dynamic> json) =>
      _$TimelineEntryFromJson(json);
}

@freezed
abstract class UpcomingOccasion with _$UpcomingOccasion {
  const factory UpcomingOccasion({
    required String contactId,
    required String contactName,
    required String occasionType,
    required String date,
    required int daysUntil,
  }) = _UpcomingOccasion;

  factory UpcomingOccasion.fromJson(Map<String, dynamic> json) =>
      _$UpcomingOccasionFromJson(json);
}

@freezed
abstract class MergePreview with _$MergePreview {
  const factory MergePreview({
    required ContactModel primary,
    required ContactModel secondary,
    required ContactModel merged,
    @Default(0) int leadsToMigrate,
    @Default(0) int invoicesToMigrate,
    @Default(0) int paymentsToMigrate,
    @Default(0) int messagesToMigrate,
  }) = _MergePreview;

  factory MergePreview.fromJson(Map<String, dynamic> json) =>
      _$MergePreviewFromJson(json);
}

@freezed
abstract class ImportResult with _$ImportResult {
  const factory ImportResult({
    @Default(0) int imported,
    @Default(0) int skipped,
    @Default(0) int total,
    @Default([]) List<ImportError> errors,
  }) = _ImportResult;

  factory ImportResult.fromJson(Map<String, dynamic> json) =>
      _$ImportResultFromJson(json);
}

@freezed
abstract class ImportError with _$ImportError {
  const factory ImportError({
    required int row,
    required String message,
  }) = _ImportError;

  factory ImportError.fromJson(Map<String, dynamic> json) =>
      _$ImportErrorFromJson(json);
}
