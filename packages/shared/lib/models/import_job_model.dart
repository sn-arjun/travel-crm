import 'package:freezed_annotation/freezed_annotation.dart';

part 'import_job_model.freezed.dart';
part 'import_job_model.g.dart';

@freezed
abstract class ImportJobModel with _$ImportJobModel {
  const factory ImportJobModel({
    required String id,
    required String importType,
    required String status,
    required String fileName,
    required String fileUrl,
    @Default(0) int fileSizeBytes,
    @Default(0) int totalRows,
    @Default(0) int processedRows,
    @Default(0) int successCount,
    @Default(0) int errorCount,
    @Default(0) int duplicateCount,
    @Default('skip') String duplicateStrategy,
    String? columnMapping,
    required String createdBy,
    String? startedAt,
    String? completedAt,
    String? createdAt,
    String? updatedAt,
  }) = _ImportJobModel;

  factory ImportJobModel.fromJson(Map<String, dynamic> json) =>
      _$ImportJobModelFromJson(json);
}

@freezed
abstract class ImportErrorModel with _$ImportErrorModel {
  const factory ImportErrorModel({
    required String id,
    required String importJobId,
    required int rowNumber,
    required String rowData,
    required String errors,
    String? createdAt,
  }) = _ImportErrorModel;

  factory ImportErrorModel.fromJson(Map<String, dynamic> json) =>
      _$ImportErrorModelFromJson(json);
}
