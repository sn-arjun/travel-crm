import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../constants/app_config.dart';
import '../storage/hive_storage.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  // Auth interceptor
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      // The agency is chosen at run time (agency-code screen), so the header is set per request.
      final tenantId = HiveStorage.tenantId;
      if (tenantId != null && tenantId.isNotEmpty) {
        options.headers['X-Tenant-Id'] = tenantId;
      }
      final token = HiveStorage.accessToken;
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      return handler.next(options);
    },
    onError: (error, handler) async {
      if (error.response?.statusCode == 401) {
        // Attempt token refresh
        final refreshed = await _refreshToken(dio);
        if (refreshed) {
          // Retry the request
          final options = error.requestOptions;
          options.headers['Authorization'] =
              'Bearer ${HiveStorage.accessToken}';
          try {
            final response = await dio.fetch(options);
            return handler.resolve(response);
          } catch (e) {
            return handler.next(error);
          }
        }
      }
      return handler.next(error);
    },
  ));

  return dio;
});

Future<bool> _refreshToken(Dio dio) async {
  final token = HiveStorage.refreshToken;
  if (token == null) return false;

  try {
    final response = await Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        if (HiveStorage.tenantId != null) 'X-Tenant-Id': HiveStorage.tenantId!,
      },
    )).post(
      ApiEndpoints.driverRefreshToken,
      data: {'refreshToken': token},
    );

    if (response.statusCode == 200 && response.data['success'] == true) {
      HiveStorage.accessToken = response.data['data']['accessToken'];
      HiveStorage.refreshToken = response.data['data']['refreshToken'];
      return true;
    }
  } catch (_) {}

  // Clear auth on refresh failure
  await HiveStorage.clearAuth();
  return false;
}
