import 'package:dio/dio.dart';
import 'package:hive_flutter/hive_flutter.dart';

class CacheInterceptor extends Interceptor {
  final Duration defaultTtl;

  static const String boxName = 'http_cache';

  CacheInterceptor({this.defaultTtl = const Duration(minutes: 5)});

  static Future<void> init() async {
    await Hive.openBox(boxName);
  }

  Box get _cacheBox => Hive.box(boxName);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method != 'GET') return handler.next(options);

    final cacheKey = options.uri.toString();
    final cached = _cacheBox.get(cacheKey);

    if (cached != null && cached is Map) {
      final cachedAt = cached['_cached_at'] as String?;
      if (cachedAt != null) {
        final age = DateTime.now().difference(DateTime.parse(cachedAt));
        if (age < defaultTtl) {
          return handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: cached['data'],
              headers: Headers.fromMap({'x-cache': ['HIT']}),
            ),
          );
        }
      }
      // Cache expired, remove
      _cacheBox.delete(cacheKey);
    }

    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (response.requestOptions.method == 'GET' && response.statusCode == 200) {
      final cacheKey = response.requestOptions.uri.toString();
      _cacheBox.put(cacheKey, {
        'data': response.data,
        '_cached_at': DateTime.now().toIso8601String(),
      });
    }
    handler.next(response);
  }

  Future<void> clearCache() async {
    await _cacheBox.clear();
  }

  void invalidate(String urlPattern) {
    final keysToRemove = _cacheBox.keys
        .where((key) => (key as String).contains(urlPattern))
        .toList();
    for (final key in keysToRemove) {
      _cacheBox.delete(key);
    }
  }
}
