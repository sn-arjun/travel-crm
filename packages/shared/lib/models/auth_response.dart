import 'package:freezed_annotation/freezed_annotation.dart';
import 'user_model.dart';

part 'auth_response.freezed.dart';
part 'auth_response.g.dart';

@freezed
abstract class AuthResponse with _$AuthResponse {
  const factory AuthResponse({
    required String accessToken,
    required String refreshToken,
    required UserModel user,
  }) = _AuthResponse;

  factory AuthResponse.fromJson(Map<String, dynamic> json) =>
      _$AuthResponseFromJson(json);
}

@freezed
abstract class TenantResolveResponse with _$TenantResolveResponse {
  const factory TenantResolveResponse({
    required List<TenantInfo> tenants,
  }) = _TenantResolveResponse;

  factory TenantResolveResponse.fromJson(Map<String, dynamic> json) =>
      _$TenantResolveResponseFromJson(json);
}

@freezed
abstract class TenantInfo with _$TenantInfo {
  const factory TenantInfo({
    required String id,
    required String companyName,
    String? logoUrl,
    required String role,
  }) = _TenantInfo;

  factory TenantInfo.fromJson(Map<String, dynamic> json) =>
      _$TenantInfoFromJson(json);
}
