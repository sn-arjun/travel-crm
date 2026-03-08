import 'package:freezed_annotation/freezed_annotation.dart';

part 'social_content_model.freezed.dart';
part 'social_content_model.g.dart';

@freezed
abstract class SocialContentModel with _$SocialContentModel {
  const factory SocialContentModel({
    required String id,
    required String contentType,
    required String platform,
    required String topic,
    String? prompt,
    required String generatedText,
    @Default([]) List<String> hashtags,
    @Default([]) List<String> mediaSuggestions,
    String? cta,
    @Default('professional') String tone,
    @Default('en') String language,
    @Default('draft') String status,
    String? modelUsed,
    @Default(0) int tokensUsed,
    @Default(0) double costEstimate,
    String? createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
  }) = _SocialContentModel;

  factory SocialContentModel.fromJson(Map<String, dynamic> json) =>
      _$SocialContentModelFromJson(json);
}
