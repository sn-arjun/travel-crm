import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/storage/hive_storage.dart';
import '../../../core/utils/api_error.dart';
import 'driver_auth_repository.dart';
import 'driver_auth_state.dart';

final driverAuthRepositoryProvider = Provider<DriverAuthRepository>((ref) {
  return DriverAuthRepository(ref.watch(dioProvider));
});

final driverAuthProvider =
    StateNotifierProvider<DriverAuthNotifier, DriverAuthState>((ref) {
  return DriverAuthNotifier(ref.watch(driverAuthRepositoryProvider));
});

class DriverAuthNotifier extends StateNotifier<DriverAuthState> {
  final DriverAuthRepository _repo;

  DriverAuthNotifier(this._repo) : super(const DriverAuthState());

  Future<void> sendOtp(String phone) async {
    state = state.copyWith(status: AuthStatus.sendingOtp, phone: phone);
    try {
      await _repo.sendOtp(phone);
      _rememberPhone(phone);
      state = state.copyWith(status: AuthStatus.otpSent);
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _extractError(e),
      );
    }
  }

  Future<bool> verifyOtp(String otp) async {
    final phone = state.phone;
    if (phone == null) return false;

    state = state.copyWith(status: AuthStatus.verifying);
    try {
      final response = await _repo.verifyOtp(phone, otp);
      final data = response['data'];
      HiveStorage.accessToken = data['accessToken'];
      HiveStorage.refreshToken = data['refreshToken'];
      HiveStorage.driverId = data['driver']['id'];
      HiveStorage.driverName = data['driver']['name'];
      HiveStorage.driverPhone = phone;
      // The sign-in response carries the agency's currency, so fares show in it from the first screen.
      final tenant = data['tenant'];
      if (tenant is Map) {
        try {
          await HiveStorage.saveAgencyLocale(
            currency: tenant['currency'] as String?,
            locale: tenant['locale'] as String?,
            country: tenant['country'] as String?,
            phoneCountry: tenant['phoneDefaultCountry'] as String?,
          );
        } catch (_) {
          // Storing the display conventions must never fail a sign-in.
        }
      }
      state = state.copyWith(status: AuthStatus.authenticated);
      return true;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _extractError(e),
      );
      return false;
    }
  }

  /// Remembers the confirmed agency; phone and OTP calls use it from now on.
  Future<void> selectAgency(AgencyInfo agency) async {
    await HiveStorage.saveAgency(
      tenantId: agency.tenantId,
      name: agency.name,
      code: agency.code,
      logoUrl: agency.logoUrl,
      currency: agency.currency,
      locale: agency.locale,
      country: agency.country,
      phoneCountry: agency.phoneCountry,
    );
    state = const DriverAuthState();
  }

  /// "Change agency": signs out and forgets the agency and its cached data.
  Future<void> changeAgency() async {
    try {
      await _repo.logout();
    } catch (_) {}
    try {
      await HiveStorage.clearAgency();
    } catch (_) {}
    state = const DriverAuthState();
  }

  Future<void> logout() async {
    try {
      await _repo.logout();
    } catch (_) {}
    try {
      await HiveStorage.clearAuth();
    } catch (_) {}
    state = const DriverAuthState();
  }

  void clearError() {
    state = state.copyWith(status: AuthStatus.initial);
  }

  /// Remembering the last phone is a convenience; a storage failure must
  /// never turn a successful OTP request into an error.
  void _rememberPhone(String phone) {
    try {
      HiveStorage.lastPhone = phone;
    } catch (_) {}
  }

  String _extractError(dynamic e) => extractAuthError(e);

  /// Exposed so the error mapping can be unit tested. Never throws.
  @visibleForTesting
  static String extractError(dynamic e) => extractAuthError(e);
}

/// Maps any failure from the auth endpoints to a driver-facing message.
String extractAuthError(Object? e) =>
    extractApiError(e, fallback: 'Something went wrong');
