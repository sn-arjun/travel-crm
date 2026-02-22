import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme.dart';
import '../data/auth_provider.dart';
import '../data/auth_state.dart';
import '../data/biometric_provider.dart';

/// Shown on app startup when biometric is enabled and refresh token exists.
/// Attempts biometric auth → if success, refreshes token → dashboard.
/// If fails or cancelled → navigates to normal login.
class BiometricPromptScreen extends ConsumerStatefulWidget {
  const BiometricPromptScreen({super.key});

  @override
  ConsumerState<BiometricPromptScreen> createState() => _BiometricPromptScreenState();
}

class _BiometricPromptScreenState extends ConsumerState<BiometricPromptScreen> {
  bool _authenticating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_attemptBiometric);
  }

  Future<void> _attemptBiometric() async {
    setState(() {
      _authenticating = true;
      _error = null;
    });

    final success = await authenticateWithBiometrics();
    if (!mounted) return;

    if (success) {
      // Biometric passed — use stored tokens to restore session
      try {
        await ref.read(authProvider.notifier).init();
        if (mounted) {
          final status = ref.read(authProvider).status;
          if (status == AuthStatus.authenticated) {
            context.go('/dashboard');
          } else {
            // Token expired despite biometric success
            context.go('/login');
          }
        }
      } catch (_) {
        if (mounted) context.go('/login');
      }
    } else {
      setState(() {
        _authenticating = false;
        _error = 'Authentication failed or cancelled';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.fingerprint_rounded,
                size: 80,
                color: _error != null ? theme.colorScheme.error : AppTheme.primaryColor,
              ),
              const SizedBox(height: 24),
              Text(
                'TravelCRM Pro',
                style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              if (_authenticating)
                Text(
                  'Authenticating...',
                  style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                )
              else if (_error != null) ...[
                Text(
                  _error!,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _attemptBiometric,
                  icon: const Icon(Icons.fingerprint_rounded, size: 20),
                  label: const Text('Try Again'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Use Password Instead'),
                ),
              ],
              if (_authenticating) ...[
                const SizedBox(height: 24),
                const CircularProgressIndicator(),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
