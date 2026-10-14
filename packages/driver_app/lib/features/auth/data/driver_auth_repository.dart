import 'package:dio/dio.dart';
import 'package:shared/shared.dart';
import '../../../core/storage/hive_storage.dart';
import '../../../core/utils/phone.dart';

/// What the public agency-code lookup reveals: the agency id, its display
/// name and an optional logo. Nothing else.
class AgencyInfo {
  final String code;
  final String tenantId;
  final String name;
  final String? logoUrl;

  const AgencyInfo({
    required this.code,
    required this.tenantId,
    required this.name,
    this.logoUrl,
  });
}

class DriverAuthRepository {
  final Dio _dio;
  final String? Function() _tenantId;

  /// [tenantId] returns the stored agency id; it defaults to the value saved
  /// by the agency-code screen.
  DriverAuthRepository(this._dio, {String? Function()? tenantId})
      : _tenantId = tenantId ?? (() => HiveStorage.tenantId);

  String _requireTenant() {
    final id = _tenantId();
    if (id == null || id.isEmpty) {
      throw 'Choose your agency first.';
    }
    return id;
  }

  /// Resolves an agency code (the agency's short name). Throws a
  /// [DioException] with status 404 for an unknown code and 429 when the
  /// lookup limit is reached.
  Future<AgencyInfo> lookupAgency(String code) async {
    final clean = code.trim().toLowerCase();
    final response = await _dio.get(ApiEndpoints.driverAgency(clean));
    final data = (response.data as Map)['data'] as Map;
    return AgencyInfo(
      code: clean,
      tenantId: data['tenantId'] as String,
      name: data['name'] as String,
      logoUrl: data['logoUrl'] as String?,
    );
  }

  Future<Map<String, dynamic>> sendOtp(String phone) async {
    final response = await _dio.post(
      ApiEndpoints.driverLogin,
      data: {
        'phone': normalizePhone(phone),
        'tenantId': _requireTenant(),
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final response = await _dio.post(
      ApiEndpoints.driverLoginVerify,
      data: {
        'phone': normalizePhone(phone),
        'tenantId': _requireTenant(),
        'otp': otp,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> refreshToken(String refreshToken) async {
    final response = await _dio.post(
      ApiEndpoints.driverRefreshToken,
      data: {'refreshToken': refreshToken},
    );
    return response.data;
  }

  Future<void> logout() async {
    await _dio.post(ApiEndpoints.driverLogout);
  }
}
