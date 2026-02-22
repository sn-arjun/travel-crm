import 'package:web/web.dart' as web;

/// Web implementation — uses window.localStorage.
/// No Web Crypto / IndexedDB involved, so no OperationError.
class TokenStore {
  static Future<String?> read(String key) async =>
      web.window.localStorage.getItem(key);

  static Future<void> write(String key, String value) async =>
      web.window.localStorage.setItem(key, value);

  static Future<void> delete(String key) async =>
      web.window.localStorage.removeItem(key);
}
