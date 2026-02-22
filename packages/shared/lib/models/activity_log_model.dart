import 'package:freezed_annotation/freezed_annotation.dart';

part 'activity_log_model.freezed.dart';
part 'activity_log_model.g.dart';

@freezed
abstract class ActivityLogModel with _$ActivityLogModel {
  const factory ActivityLogModel({
    required String id,
    String? userId,
    String? userName,
    required String action,
    String? entityType,
    String? entityId,
    String? details,
    String? ipAddress,
    String? createdAt,
  }) = _ActivityLogModel;

  factory ActivityLogModel.fromJson(Map<String, dynamic> json) =>
      _$ActivityLogModelFromJson(json);
}
