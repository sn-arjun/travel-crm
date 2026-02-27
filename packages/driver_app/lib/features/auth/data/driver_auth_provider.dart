import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/api_client_provider.dart';
import '../../../core/storage/hive_storage.dart';
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
      HiveStorage.lastPhone = phone;
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

  Future<void> logout() async {
    try {
      await _repo.logout();
    } catch (_) {}
    await HiveStorage.clearAuth();
    state = const DriverAuthState();
  }

  void clearError() {
    state = state.copyWith(status: AuthStatus.initial);
  }

  String _extractError(dynamic e) {
    if (e is DioException && e.response?.data is Map) {
      return e.response?.data['error'] ?? 'Something went wrong';
    }
    return 'Something went wrong';
  }
}
