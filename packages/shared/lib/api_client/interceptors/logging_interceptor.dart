import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class AppLoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('[API] → ${options.method} ${options.uri}');
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('[API] ← ${response.statusCode} ${response.requestOptions.uri}');
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('[API] ✗ ${err.response?.statusCode ?? 'NETWORK'} ${err.requestOptions.uri}: ${err.message}');
    }
    handler.next(err);
  }
}
