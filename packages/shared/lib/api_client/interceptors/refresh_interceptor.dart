import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../constants/storage_keys.dart';
import '../../constants/app_constants.dart';

class RefreshInterceptor extends Interceptor {
  final Dio dio;
  final FlutterSecureStorage storage;
  bool _isRefreshing = false;

  RefreshInterceptor({required this.dio, required this.storage});

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && !_isRefreshing) {
      _isRefreshing = true;
      try {
        final refreshToken = await storage.read(key: StorageKeys.refreshToken);
        if (refreshToken == null) {
          _isRefreshing = false;
          return handler.next(err);
        }

        final response = await Dio(BaseOptions(baseUrl: AppConstants.apiBaseUrl)).post(
          '/api/v1/auth/refresh-token',
          data: {'refreshToken': refreshToken},
        );

        if (response.statusCode == 200) {
          final newAccessToken = response.data['data']['accessToken'] as String;
          final newRefreshToken = response.data['data']['refreshToken'] as String;

          await storage.write(key: StorageKeys.accessToken, value: newAccessToken);
          await storage.write(key: StorageKeys.refreshToken, value: newRefreshToken);

          // Retry original request
          final options = err.requestOptions;
          options.headers['Authorization'] = 'Bearer $newAccessToken';
          final retryResponse = await dio.fetch(options);
          _isRefreshing = false;
          return handler.resolve(retryResponse);
        }
      } catch (_) {
        // Refresh failed — clear tokens
        await storage.delete(key: StorageKeys.accessToken);
        await storage.delete(key: StorageKeys.refreshToken);
      }
      _isRefreshing = false;
    }
    handler.next(err);
  }
}
