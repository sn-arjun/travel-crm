import 'package:freezed_annotation/freezed_annotation.dart';

part 'flyer_template_model.freezed.dart';
part 'flyer_template_model.g.dart';

@freezed
abstract class FlyerTemplateModel with _$FlyerTemplateModel {
  const factory FlyerTemplateModel({
    required String id,
    String? tenantId,
    required String name,
    required String category,
    String? description,
    String? thumbnailUrl,
    String? layoutJson,
    required int width,
    required int height,
    required String sizePreset,
    String? placeholders,
    @Default(false) bool isSystem,
    @Default(false) bool isQuickCreate,
    @Default(true) bool isActive,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
    @Default([]) List<FlyerTemplateAssetModel> assets,
  }) = _FlyerTemplateModel;

  factory FlyerTemplateModel.fromJson(Map<String, dynamic> json) =>
      _$FlyerTemplateModelFromJson(json);
}

@freezed
abstract class FlyerTemplateAssetModel with _$FlyerTemplateAssetModel {
  const factory FlyerTemplateAssetModel({
    required String id,
    required String templateId,
    required String assetType,
    String? assetUrl,
    String? positionJson,
    @Default(0) int layerOrder,
    String? propertiesJson,
    String? createdAt,
  }) = _FlyerTemplateAssetModel;

  factory FlyerTemplateAssetModel.fromJson(Map<String, dynamic> json) =>
      _$FlyerTemplateAssetModelFromJson(json);
}
