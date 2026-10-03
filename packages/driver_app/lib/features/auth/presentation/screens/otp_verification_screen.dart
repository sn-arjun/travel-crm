import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../data/driver_auth_provider.dart';
import '../../data/driver_auth_state.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  final String phone;

  const OtpVerificationScreen({super.key, required this.phone});

  @override
  ConsumerState<OtpVerificationScreen> createState() =>
      _OtpVerificationScreenState();
}

class _OtpVerificationScreenState
    extends ConsumerState<OtpVerificationScreen> {
  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (_) => FocusNode());

  Timer? _resendTimer;
  int _resendSeconds = 60;
  bool _canResend = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startResendTimer();
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _resendSeconds = 60;
    _canResend = false;
    _resendTimer?.cancel();
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _resendSeconds--;
        if (_resendSeconds <= 0) {
          _canResend = true;
          timer.cancel();
        }
      });
    });
  }

  String get _otp => _controllers.map((c) => c.text).join();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final authState = ref.watch(driverAuthProvider);

    ref.listen<DriverAuthState>(driverAuthProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        context.go('/trips');
      } else if (next.status == AuthStatus.error && next.errorMessage != null) {
        setState(() => _error = next.errorMessage);
        // Clear OTP fields
        for (final c in _controllers) {
          c.clear();
        }
        _focusNodes[0].requestFocus();
        ref.read(driverAuthProvider.notifier).clearError();
      }
    });

    final isVerifying = authState.status == AuthStatus.verifying;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.enterOtp),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Icon(Icons.sms_outlined,
                      size: 36, color: scheme.primary),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                l10n.otpSentTo(widget.phone),
                style: text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  for (var index = 0; index < 6; index++) ...[
                    if (index > 0) const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        key: Key('otp-$index'),
                        controller: _controllers[index],
                        focusNode: _focusNodes[index],
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        maxLength: 1,
                        style: text.headlineSmall,
                        decoration: const InputDecoration(
                          counterText: '',
                          contentPadding: EdgeInsets.symmetric(vertical: 16),
                        ),
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onChanged: (value) {
                          if (value.isNotEmpty && index < 5) {
                            _focusNodes[index + 1].requestFocus();
                          }
                          if (value.isEmpty && index > 0) {
                            _focusNodes[index - 1].requestFocus();
                          }
                          // Re-evaluate whether the Verify button is enabled.
                          // Verification is always an explicit tap on Verify.
                          setState(() => _error = null);
                        },
                      ),
                    ),
                  ],
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Row(
                  key: const Key('otp-error'),
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error_outline, size: 18, color: scheme.error),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        _error!,
                        style: text.bodyMedium?.copyWith(color: scheme.error),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 28),
              FilledButton(
                key: const Key('verify-otp'),
                onPressed: isVerifying || _otp.length < 6 ? null : _verify,
                child: isVerifying ? const ButtonSpinner() : Text(l10n.verify),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _canResend ? _resend : null,
                child: Text(
                  _canResend
                      ? l10n.resendOtp
                      : l10n.resendIn(_resendSeconds),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _verify() {
    if (ref.read(driverAuthProvider).status == AuthStatus.verifying) return;
    ref.read(driverAuthProvider.notifier).verifyOtp(_otp);
  }

  void _resend() {
    ref.read(driverAuthProvider.notifier).sendOtp(widget.phone);
    _startResendTimer();
  }
}
