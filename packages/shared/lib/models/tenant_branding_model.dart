import 'package:freezed_annotation/freezed_annotation.dart';

part 'tenant_branding_model.freezed.dart';
part 'tenant_branding_model.g.dart';

@freezed
abstract class TenantBrandingModel with _$TenantBrandingModel {
  const factory TenantBrandingModel({
    String? id,
    String? tenantId,
    String? logoUrl,
    @Default('#1976D2') String primaryColor,
    @Default('#424242') String secondaryColor,
    @Default('#FF9800') String accentColor,
    @Default('Roboto') String primaryFont,
    @Default('Open Sans') String secondaryFont,
    String? agencyName,
    String? agencyPhone,
    String? agencyEmail,
    String? agencyWebsite,
    String? tagline,
    String? createdAt,
    String? updatedAt,
  }) = _TenantBrandingModel;

  factory TenantBrandingModel.fromJson(Map<String, dynamic> json) =>
      _$TenantBrandingModelFromJson(json);
}
