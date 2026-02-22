import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import 'auth_state.dart';
import 'auth_repository.dart';
import 'token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(apiClient: ref.read(apiClientProvider)),
);

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(
    repository: ref.read(authRepositoryProvider),
    tokenStorage: ref.read(tokenStorageProvider),
  ),
);

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repository;
  final TokenStorage _tokenStorage;

  AuthNotifier({
    required AuthRepository repository,
    required TokenStorage tokenStorage,
  })  : _repository = repository,
        _tokenStorage = tokenStorage,
        super(const AuthState());

  /// Check if user is already logged in (called on app start)
  Future<void> init() async {
    state = state.copyWith(status: AuthStatus.loading);

    final hasTokens = await _tokenStorage.hasTokens();
    if (!hasTokens) {
      state = state.copyWith(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _repository.getProfile();
      state = state.copyWith(status: AuthStatus.authenticated, user: user);
    } catch (_) {
      // Token expired or invalid
      await _tokenStorage.clearAuthData();
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  /// Step 1: Resolve tenant by email
  Future<void> resolveTenant(String email) async {
    state = state.copyWith(status: AuthStatus.loading, error: null);

    try {
      final response = await _repository.resolveTenant(email);

      if (response.tenants.length == 1) {
        state = state.copyWith(
          status: AuthStatus.tenantResolved,
          tenants: response.tenants,
          selectedTenant: response.tenants.first,
          email: email,
        );
      } else {
        state = state.copyWith(
          status: AuthStatus.tenantResolved,
          tenants: response.tenants,
          email: email,
        );
      }
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: _extractError(e),
      );
    }
  }

  /// Select a tenant (when user has multiple)
  void selectTenant(TenantInfo tenant) {
    state = state.copyWith(selectedTenant: tenant);
  }

  /// Step 2: Login with password
  Future<void> login(String password) async {
    final email = state.email;
    final tenant = state.selectedTenant;
    if (email == null || tenant == null) return;

    state = state.copyWith(status: AuthStatus.loading, error: null);

    try {
      final response = await _repository.login(
        email: email,
        password: password,
        tenantId: tenant.id,
      );

      await _tokenStorage.saveAuthData(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        userId: response.user.id,
        tenantId: tenant.id,
        role: response.user.role,
        name: response.user.name,
        email: response.user.email,
      );

      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: response.user,
      );
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.tenantResolved,
        error: _extractError(e),
      );
    }
  }

  /// OTP: send
  Future<void> sendOtp(String phone) async {
    final tenant = state.selectedTenant;
    if (tenant == null) return;

    state = state.copyWith(error: null);

    try {
      await _repository.sendOtp(phone: phone, tenantId: tenant.id);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  /// OTP: verify
  Future<void> verifyOtp(String phone, String otp) async {
    final tenant = state.selectedTenant;
    if (tenant == null) return;

    state = state.copyWith(status: AuthStatus.loading, error: null);

    try {
      final response = await _repository.verifyOtp(
        phone: phone,
        otp: otp,
        tenantId: tenant.id,
      );

      await _tokenStorage.saveAuthData(
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        userId: response.user.id,
        tenantId: tenant.id,
        role: response.user.role,
        name: response.user.name,
        email: response.user.email,
      );

      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: response.user,
      );
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.tenantResolved,
        error: _extractError(e),
      );
    }
  }

  /// Refresh user profile without changing auth status
  Future<void> refreshProfile() async {
    try {
      final user = await _repository.getProfile();
      state = state.copyWith(user: user);
    } catch (_) {
      // Silently fail — don't logout just because profile refresh failed
    }
  }

  /// Logout
  Future<void> logout() async {
    try {
      await _repository.logout();
    } catch (_) {
      // Best effort
    }
    await _tokenStorage.clearAuthData();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Go back to email entry
  void resetToEmail() {
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Something went wrong. Please try again.';
  }
}
