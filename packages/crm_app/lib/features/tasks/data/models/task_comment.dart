import 'package:freezed_annotation/freezed_annotation.dart';

part 'task_comment.freezed.dart';
part 'task_comment.g.dart';

@freezed
abstract class TaskComment with _$TaskComment {
  const factory TaskComment({
    required String id,
    @JsonKey(name: 'task_id') required String taskId,
    @JsonKey(name: 'user_id') required String userId,
    required String content,
    @JsonKey(name: 'user_name') String? userName,
    @JsonKey(name: 'avatar_url') String? avatarUrl,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _TaskComment;

  factory TaskComment.fromJson(Map<String, dynamic> json) =>
      _$TaskCommentFromJson(json);
}
