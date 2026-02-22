import 'package:shared/shared.dart';

/// Wraps [TokenStore] (platform-conditional: localStorage on web,
/// flutter_secure_storage on native) for a clean async key/value API.
class TokenStorage {
  // --- Access Token ---
  Future<String?> getAccessToken() => TokenStore.read(StorageKeys.accessToken);
  Future<void> setAccessToken(String token) =>
      TokenStore.write(StorageKeys.accessToken, token);

  // --- Refresh Token ---
  Future<String?> getRefreshToken() => TokenStore.read(StorageKeys.refreshToken);
  Future<void> setRefreshToken(String token) =>
      TokenStore.write(StorageKeys.refreshToken, token);

  // --- User Info ---
  Future<String?> getUserId() => TokenStore.read(StorageKeys.userId);
  Future<void> setUserId(String id) => TokenStore.write(StorageKeys.userId, id);

  Future<String?> getTenantId() => TokenStore.read(StorageKeys.tenantId);
  Future<void> setTenantId(String id) =>
      TokenStore.write(StorageKeys.tenantId, id);

  Future<String?> getUserRole() => TokenStore.read(StorageKeys.userRole);
  Future<void> setUserRole(String role) =>
      TokenStore.write(StorageKeys.userRole, role);

  Future<String?> getUserName() => TokenStore.read(StorageKeys.userName);
  Future<void> setUserName(String name) =>
      TokenStore.write(StorageKeys.userName, name);

  Future<String?> getUserEmail() => TokenStore.read(StorageKeys.userEmail);
  Future<void> setUserEmail(String email) =>
      TokenStore.write(StorageKeys.userEmail, email);

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
      TokenStore.delete(StorageKeys.accessToken),
      TokenStore.delete(StorageKeys.refreshToken),
      TokenStore.delete(StorageKeys.userId),
      TokenStore.delete(StorageKeys.tenantId),
      TokenStore.delete(StorageKeys.userRole),
      TokenStore.delete(StorageKeys.userName),
      TokenStore.delete(StorageKeys.userEmail),
    ]);
  }

  // --- Check if logged in ---
  Future<bool> hasTokens() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }
}
