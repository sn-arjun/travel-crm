import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/auth_provider.dart';
import '../data/auth_state.dart';
import '../data/biometric_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(_initialize);
  }

  Future<void> _initialize() async {
    final authNotifier = ref.read(authProvider.notifier);
    await authNotifier.init();
    if (!mounted) return;

    final status = ref.read(authProvider).status;

    if (status == AuthStatus.authenticated) {
      context.go('/dashboard');
      return;
    }

    // Not authenticated — check if biometric re-auth is possible
    // Only on mobile platforms (not web/windows)
    if (!kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS)) {
      final tokenStorage = ref.read(tokenStorageProvider);
      final hasRefreshToken = await tokenStorage.getRefreshToken() != null;
      final biometricEnabled = ref.read(biometricEnabledProvider).valueOrNull ?? false;

      if (hasRefreshToken && biometricEnabled) {
        if (mounted) context.go('/biometric');
        return;
      }
    }

    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.flight_takeoff,
              size: 64,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 24),
            Text(
              'TravelCRM Pro',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
