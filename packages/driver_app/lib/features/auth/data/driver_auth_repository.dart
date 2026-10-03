import 'package:dio/dio.dart';
import 'package:shared/shared.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/utils/phone.dart';

class DriverAuthRepository {
  final Dio _dio;

  DriverAuthRepository(this._dio);

  Future<Map<String, dynamic>> sendOtp(String phone) async {
    final response = await _dio.post(
      ApiEndpoints.driverLogin,
      data: {
        'phone': normalizePhone(phone),
        'tenantId': AppConfig.tenantId,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final response = await _dio.post(
      ApiEndpoints.driverLoginVerify,
      data: {
        'phone': normalizePhone(phone),
        'tenantId': AppConfig.tenantId,
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
