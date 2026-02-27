import 'package:freezed_annotation/freezed_annotation.dart';

part 'report_state.freezed.dart';
part 'report_state.g.dart';

@freezed
abstract class DrillDownConfig with _$DrillDownConfig {
  const factory DrillDownConfig({
    required String reportId,
    required Map<String, String> paramsMapping,
  }) = _DrillDownConfig;

  factory DrillDownConfig.fromJson(Map<String, dynamic> json) =>
      _$DrillDownConfigFromJson(json);
}

@freezed
abstract class ReportColumnDef with _$ReportColumnDef {
  const factory ReportColumnDef({
    required String name,
    required String type,
    DrillDownConfig? drillDown,
  }) = _ReportColumnDef;

  factory ReportColumnDef.fromJson(Map<String, dynamic> json) =>
      _$ReportColumnDefFromJson(json);
}

@freezed
abstract class ReportMeta with _$ReportMeta {
  const factory ReportMeta({
    required int total,
    required int page,
    @JsonKey(name: 'per_page') required int perPage,
  }) = _ReportMeta;

  factory ReportMeta.fromJson(Map<String, dynamic> json) =>
      _$ReportMetaFromJson(json);
}

@freezed
abstract class ReportResult with _$ReportResult {
  const factory ReportResult({
    required List<Map<String, dynamic>> data,
    required List<ReportColumnDef> columns,
    required ReportMeta meta,
    @JsonKey(name: 'previous_period') Map<String, dynamic>? previousPeriod,
    Map<String, dynamic>? changes,
    @JsonKey(name: 'cached_at') String? cachedAt,
  }) = _ReportResult;

  factory ReportResult.fromJson(Map<String, dynamic> json) =>
      _$ReportResultFromJson(json);
}

@freezed
abstract class ReportDefinition with _$ReportDefinition {
  const factory ReportDefinition({
    required String id,
    required String name,
    required String category,
    required String description,
    required List<ReportColumnDef> columns,
  }) = _ReportDefinition;

  factory ReportDefinition.fromJson(Map<String, dynamic> json) =>
      _$ReportDefinitionFromJson(json);
}
