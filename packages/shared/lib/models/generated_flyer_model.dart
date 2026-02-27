import 'package:freezed_annotation/freezed_annotation.dart';

part 'generated_flyer_model.freezed.dart';
part 'generated_flyer_model.g.dart';

@freezed
abstract class GeneratedFlyerModel with _$GeneratedFlyerModel {
  const factory GeneratedFlyerModel({
    required String id,
    String? tenantId,
    String? templateId,
    required String name,
    String? layoutJson,
    String? r2Key,
    String? url,
    String? thumbnailUrl,
    @Default('png') String format,
    int? width,
    int? height,
    int? fileSize,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
    @Default([]) List<FlyerShareModel> shares,
  }) = _GeneratedFlyerModel;

  factory GeneratedFlyerModel.fromJson(Map<String, dynamic> json) =>
      _$GeneratedFlyerModelFromJson(json);
}

@freezed
abstract class FlyerShareModel with _$FlyerShareModel {
  const factory FlyerShareModel({
    required String id,
    required String flyerId,
    required String channel,
    String? recipientInfo,
    String? sharedBy,
    String? sharedAt,
  }) = _FlyerShareModel;

  factory FlyerShareModel.fromJson(Map<String, dynamic> json) =>
      _$FlyerShareModelFromJson(json);
}
