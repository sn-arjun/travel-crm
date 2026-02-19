import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared/shared.dart';

class TokenStorage {
  final FlutterSecureStorage _storage;

  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  // --- Access Token ---
  Future<String?> getAccessToken() =>
      _storage.read(key: StorageKeys.accessToken);

  Future<void> setAccessToken(String token) =>
      _storage.write(key: StorageKeys.accessToken, value: token);

  // --- Refresh Token ---
  Future<String?> getRefreshToken() =>
      _storage.read(key: StorageKeys.refreshToken);

  Future<void> setRefreshToken(String token) =>
      _storage.write(key: StorageKeys.refreshToken, value: token);

  // --- User Info ---
  Future<String?> getUserId() => _storage.read(key: StorageKeys.userId);

  Future<void> setUserId(String id) =>
      _storage.write(key: StorageKeys.userId, value: id);

  Future<String?> getTenantId() => _storage.read(key: StorageKeys.tenantId);

  Future<void> setTenantId(String id) =>
      _storage.write(key: StorageKeys.tenantId, value: id);

  Future<String?> getUserRole() => _storage.read(key: StorageKeys.userRole);

  Future<void> setUserRole(String role) =>
      _storage.write(key: StorageKeys.userRole, value: role);

  Future<String?> getUserName() => _storage.read(key: StorageKeys.userName);

  Future<void> setUserName(String name) =>
      _storage.write(key: StorageKeys.userName, value: name);

  Future<String?> getUserEmail() => _storage.read(key: StorageKeys.userEmail);

  Future<void> setUserEmail(String email) =>
      _storage.write(key: StorageKeys.userEmail, value: email);

  // --- Store all auth data at once ---
  Future<void> saveAuthData({
    required String accessToken,
    required String refreshToken,
    required String userId,
    required String tenantId,
    required String role,
    required String name,
    required String email,
  }) async {
    await Future.wait([
      setAccessToken(accessToken),
      setRefreshToken(refreshToken),
      setUserId(userId),
      setTenantId(tenantId),
      setUserRole(role),
      setUserName(name),
      setUserEmail(email),
    ]);
  }

  // --- Clear all auth data ---
  Future<void> clearAuthData() async {
    await Future.wait([
      _storage.delete(key: StorageKeys.accessToken),
      _storage.delete(key: StorageKeys.refreshToken),
      _storage.delete(key: StorageKeys.userId),
      _storage.delete(key: StorageKeys.tenantId),
      _storage.delete(key: StorageKeys.userRole),
      _storage.delete(key: StorageKeys.userName),
      _storage.delete(key: StorageKeys.userEmail),
    ]);
  }

  // --- Check if logged in ---
  Future<bool> hasTokens() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }
}
