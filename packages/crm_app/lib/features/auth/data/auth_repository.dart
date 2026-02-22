import 'package:shared/shared.dart';

class AuthRepository {
  final ApiClient _apiClient;

  AuthRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  /// Resolve tenant by email — returns list of tenants the user belongs to
  Future<TenantResolveResponse> resolveTenant(String email) async {
    final response = await _apiClient.post(
      ApiEndpoints.resolveTenant,
      data: {'email': email},
    );
    return TenantResolveResponse.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Login with email + password
  Future<AuthResponse> login({
    required String email,
    required String password,
    required String tenantId,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.login,
      data: {
        'email': email,
        'password': password,
        'tenantId': tenantId,
      },
    );
    return AuthResponse.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Send OTP to phone number
  Future<void> sendOtp({
    required String phone,
    required String tenantId,
  }) async {
    await _apiClient.post(
      ApiEndpoints.sendOtp,
      data: {'phone': phone, 'tenantId': tenantId},
    );
  }

  /// Verify OTP
  Future<AuthResponse> verifyOtp({
    required String phone,
    required String otp,
    required String tenantId,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.verifyOtp,
      data: {
        'phone': phone,
        'otp': otp,
        'tenantId': tenantId,
      },
    );
    return AuthResponse.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Refresh tokens
  Future<AuthResponse> refreshTokens(String refreshToken) async {
    final response = await _apiClient.post(
      ApiEndpoints.refreshToken,
      data: {'refreshToken': refreshToken},
    );
    return AuthResponse.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Forgot password — send reset email
  Future<void> forgotPassword(String email) async {
    await _apiClient.post(
      ApiEndpoints.forgotPassword,
      data: {'email': email},
    );
  }

  /// Reset password with token
  Future<void> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    await _apiClient.post(
      ApiEndpoints.resetPassword,
      data: {'token': token, 'password': newPassword},
    );
  }

  /// Setup account (from invitation link)
  Future<AuthResponse> setupAccount({
    required String token,
    required String name,
    required String password,
    String? phone,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.setupAccount,
      data: {
        'token': token,
        'name': name,
        'password': password,
        if (phone != null) 'phone': phone,
      },
    );
    return AuthResponse.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Logout
  Future<void> logout() async {
    await _apiClient.post(ApiEndpoints.logout);
  }

  /// Get current user profile
  Future<UserModel> getProfile() async {
    final response = await _apiClient.get(ApiEndpoints.profile);
    return UserModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Update profile
  Future<UserModel> updateProfile(Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.profile, data: data);
    return UserModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Get active sessions
  Future<List<SessionModel>> getSessions() async {
    final response = await _apiClient.get(ApiEndpoints.sessions);
    final list = response.data['data'] as List;
    return list
        .map((e) => SessionModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Revoke a specific session
  Future<void> revokeSession(String sessionId) async {
    await _apiClient.delete(ApiEndpoints.revokeSession(sessionId));
  }

  /// Revoke all other sessions
  Future<void> revokeAllSessions() async {
    await _apiClient.delete(ApiEndpoints.revokeAllSessions);
  }
}
