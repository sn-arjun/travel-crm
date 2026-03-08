import 'package:freezed_annotation/freezed_annotation.dart';

part 'bookmark_model.freezed.dart';
part 'bookmark_model.g.dart';

@freezed
abstract class BookmarkModel with _$BookmarkModel {
  const factory BookmarkModel({
    required String id,
    @JsonKey(name: 'user_id') required String userId,
    @JsonKey(name: 'entity_type') required String entityType,
    @JsonKey(name: 'entity_id') required String entityId,
    @JsonKey(name: 'entity_name') String? entityName,
    @JsonKey(name: 'created_at') String? createdAt,
  }) = _BookmarkModel;

  factory BookmarkModel.fromJson(Map<String, dynamic> json) =>
      _$BookmarkModelFromJson(json);
}

@freezed
abstract class StickyNoteModel with _$StickyNoteModel {
  const factory StickyNoteModel({
    required String id,
    @JsonKey(name: 'user_id') required String userId,
    required String content,
    @Default('yellow') String color,
    @JsonKey(name: 'is_pinned') @Default(0) int isPinned,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _StickyNoteModel;

  factory StickyNoteModel.fromJson(Map<String, dynamic> json) =>
      _$StickyNoteModelFromJson(json);
}
