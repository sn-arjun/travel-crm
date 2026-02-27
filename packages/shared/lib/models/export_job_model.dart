import 'package:freezed_annotation/freezed_annotation.dart';

part 'export_job_model.freezed.dart';
part 'export_job_model.g.dart';

@freezed
abstract class ExportJobModel with _$ExportJobModel {
  const factory ExportJobModel({
    required String id,
    required String exportType,
    required String status,
    String? fileUrl,
    @Default(0) int fileSizeBytes,
    String? recordCounts,
    required String createdBy,
    String? startedAt,
    String? completedAt,
    String? createdAt,
    String? updatedAt,
  }) = _ExportJobModel;

  factory ExportJobModel.fromJson(Map<String, dynamic> json) =>
      _$ExportJobModelFromJson(json);
}
