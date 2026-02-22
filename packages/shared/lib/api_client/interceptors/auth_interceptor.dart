import 'package:dio/dio.dart';
import '../../constants/storage_keys.dart';
import '../../core/storage/token_store.dart';

class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    _attachTokens(options, handler);
  }

  Future<void> _attachTokens(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      final token = await TokenStore.read(StorageKeys.accessToken);
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      final refreshToken = await TokenStore.read(StorageKeys.refreshToken);
      if (refreshToken != null) {
        options.headers['X-Refresh-Token'] = refreshToken;
      }
    } catch (_) {
      // Proceed without tokens if storage read fails
    }
    handler.next(options);
  }
}
