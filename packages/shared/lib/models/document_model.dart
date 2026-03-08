import 'package:freezed_annotation/freezed_annotation.dart';

part 'document_model.freezed.dart';
part 'document_model.g.dart';

@freezed
abstract class DocumentModel with _$DocumentModel {
  const factory DocumentModel({
    required String id,
    required String name,
    @JsonKey(name: 'file_url') required String fileUrl,
    @JsonKey(name: 'file_size') int? fileSize,
    @JsonKey(name: 'mime_type') String? mimeType,
    String? type,
    String? category,
    @JsonKey(name: 'related_to') String? relatedTo,
    @JsonKey(name: 'related_id') String? relatedId,
    String? description,
    @JsonKey(name: 'uploaded_by') String? uploadedBy,
    @JsonKey(name: 'uploader_name') String? uploaderName,
    @JsonKey(name: 'is_deleted') @Default(0) int isDeleted,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _DocumentModel;

  factory DocumentModel.fromJson(Map<String, dynamic> json) =>
      _$DocumentModelFromJson(json);
}
