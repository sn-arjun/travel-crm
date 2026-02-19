import 'package:shared/shared.dart';

enum AuthStatus {
  initial,
  loading,
  unauthenticated,
  tenantResolved,
  authenticated,
}

class AuthState {
  final AuthStatus status;
  final UserModel? user;
  final List<TenantInfo>? tenants;
  final TenantInfo? selectedTenant;
  final String? email;
  final String? error;

  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.tenants,
    this.selectedTenant,
    this.email,
    this.error,
  });

  AuthState copyWith({
    AuthStatus? status,
    UserModel? user,
    List<TenantInfo>? tenants,
    TenantInfo? selectedTenant,
    String? email,
    String? error,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      tenants: tenants ?? this.tenants,
      selectedTenant: selectedTenant ?? this.selectedTenant,
      email: email ?? this.email,
      error: error ?? this.error,
    );
  }

  AuthState clearError() => AuthState(
        status: status,
        user: user,
        tenants: tenants,
        selectedTenant: selectedTenant,
        email: email,
      );
}
