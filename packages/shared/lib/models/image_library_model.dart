import 'package:freezed_annotation/freezed_annotation.dart';

part 'image_library_model.freezed.dart';
part 'image_library_model.g.dart';

@freezed
abstract class ImageLibraryModel with _$ImageLibraryModel {
  const factory ImageLibraryModel({
    required String id,
    String? tenantId,
    required String filename,
    String? originalFilename,
    required String r2Key,
    String? thumbnailR2Key,
    required String url,
    String? thumbnailUrl,
    @Default('uploaded') String category,
    String? tags,
    int? width,
    int? height,
    int? fileSize,
    String? mimeType,
    String? uploadedBy,
    String? createdAt,
  }) = _ImageLibraryModel;

  factory ImageLibraryModel.fromJson(Map<String, dynamic> json) =>
      _$ImageLibraryModelFromJson(json);
}
