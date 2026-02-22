import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether biometric auth is supported on this device.
/// Always false on web/Windows/Linux.
final biometricAvailableProvider = FutureProvider<bool>((ref) async {
  if (kIsWeb) return false;
  if (defaultTargetPlatform != TargetPlatform.android &&
      defaultTargetPlatform != TargetPlatform.iOS) {
    return false;
  }
  try {
    final auth = LocalAuthentication();
    final canCheck = await auth.canCheckBiometrics;
    final isDeviceSupported = await auth.isDeviceSupported();
    return canCheck && isDeviceSupported;
  } catch (_) {
    return false;
  }
});

/// Whether the user has opted in to biometric login.
final biometricEnabledProvider =
    StateNotifierProvider<BiometricEnabledNotifier, AsyncValue<bool>>(
  (ref) => BiometricEnabledNotifier(),
);

class BiometricEnabledNotifier extends StateNotifier<AsyncValue<bool>> {
  static const _key = 'biometric_enabled';

  BiometricEnabledNotifier() : super(const AsyncValue.loading()) {
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      state = AsyncValue.data(prefs.getBool(_key) ?? false);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, enabled);
    state = AsyncValue.data(enabled);
  }
}

/// Attempt biometric authentication. Returns true if success, false otherwise.
Future<bool> authenticateWithBiometrics() async {
  if (kIsWeb) return false;
  if (defaultTargetPlatform != TargetPlatform.android &&
      defaultTargetPlatform != TargetPlatform.iOS) {
    return false;
  }
  try {
    final auth = LocalAuthentication();
    return await auth.authenticate(
      localizedReason: 'Authenticate to access TravelCRM Pro',
      options: const AuthenticationOptions(
        biometricOnly: true,
        stickyAuth: true,
      ),
    );
  } catch (_) {
    return false;
  }
}
