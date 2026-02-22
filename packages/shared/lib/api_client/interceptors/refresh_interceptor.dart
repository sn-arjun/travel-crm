import 'package:dio/dio.dart';
import '../../constants/storage_keys.dart';
import '../../constants/app_constants.dart';
import '../../core/storage/token_store.dart';

class RefreshInterceptor extends Interceptor {
  final Dio dio;
  bool _isRefreshing = false;

  RefreshInterceptor({required this.dio});

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401 && !_isRefreshing) {
      _handleTokenRefresh(err, handler);
      return;
    }
    handler.next(err);
  }

  Future<void> _handleTokenRefresh(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    _isRefreshing = true;
    try {
      final refreshToken = await TokenStore.read(StorageKeys.refreshToken);
      if (refreshToken == null) {
        _isRefreshing = false;
        return handler.next(err);
      }

      final response = await Dio(
        BaseOptions(baseUrl: AppConstants.apiBaseUrl),
      ).post(
        '/api/v1/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data is! Map<String, dynamic>) {
          throw Exception('Invalid refresh response format');
        }

        final tokens = data['data'] as Map<String, dynamic>?;
        final newAccessToken = tokens?['accessToken'] as String?;
        final newRefreshToken = tokens?['refreshToken'] as String?;

        if (newAccessToken == null || newRefreshToken == null) {
          throw Exception('Missing tokens in refresh response');
        }

        await TokenStore.write(StorageKeys.accessToken, newAccessToken);
        await TokenStore.write(StorageKeys.refreshToken, newRefreshToken);

        // Retry original request
        final options = err.requestOptions;
        options.headers['Authorization'] = 'Bearer $newAccessToken';
        final retryResponse = await dio.fetch(options);
        _isRefreshing = false;
        return handler.resolve(retryResponse);
      }
    } catch (_) {
      // Refresh failed — clear tokens
      await TokenStore.delete(StorageKeys.accessToken);
      await TokenStore.delete(StorageKeys.refreshToken);
    }
    _isRefreshing = false;
    handler.next(err);
  }
}
