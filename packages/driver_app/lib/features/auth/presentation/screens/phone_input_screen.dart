import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/storage/hive_storage.dart';
import '../../../../core/utils/phone.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../data/driver_auth_provider.dart';
import '../../data/driver_auth_state.dart';

class PhoneInputScreen extends ConsumerStatefulWidget {
  const PhoneInputScreen({super.key});

  @override
  ConsumerState<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends ConsumerState<PhoneInputScreen> {
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  String _countryCode = '+91';
  String? _error;

  @override
  void initState() {
    super.initState();
    try {
      final lastPhone = HiveStorage.lastPhone;
      if (lastPhone != null) {
        _phoneController.text = nationalDigits(lastPhone);
      }
    } catch (_) {
      // Storage not available yet; start with an empty field.
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final authState = ref.watch(driverAuthProvider);

    ref.listen<DriverAuthState>(driverAuthProvider, (prev, next) {
      // Ignore updates while the OTP screen is on top (e.g. "Resend OTP").
      if (ModalRoute.of(context)?.isCurrent == false) return;
      if (next.status == AuthStatus.otpSent) {
        context.push('/login/otp', extra: '$_countryCode${_phoneController.text.trim()}');
      } else if (next.status == AuthStatus.error && next.errorMessage != null) {
        setState(() => _error = next.errorMessage);
        ref.read(driverAuthProvider.notifier).clearError();
      }
    });

    final isSending = authState.status == AuthStatus.sendingOtp;

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Center(
                      child: Container(
                        key: const Key('brand-mark'),
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          color: scheme.primaryContainer,
                          borderRadius: BorderRadius.circular(26),
                        ),
                        child: Icon(
                          Icons.directions_car_rounded,
                          size: 46,
                          color: scheme.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      l10n.appTitle,
                      style: text.headlineMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.loginTagline,
                      style: text.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 36),
                    Text(l10n.loginTitle, style: text.titleLarge),
                    const SizedBox(height: 4),
                    Text(
                      l10n.loginSubtitle,
                      style: text.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 112,
                          child: DropdownButtonFormField<String>(
                            key: const Key('country-code'),
                            initialValue: _countryCode,
                            isExpanded: true,
                            items: const [
                              DropdownMenuItem(
                                  value: '+91', child: Text('+91')),
                              DropdownMenuItem(
                                  value: '+971', child: Text('+971')),
                              DropdownMenuItem(
                                  value: '+966', child: Text('+966')),
                              DropdownMenuItem(
                                  value: '+1', child: Text('+1')),
                            ],
                            onChanged: (v) =>
                                setState(() => _countryCode = v ?? '+91'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            key: const Key('phone-field'),
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                            style: text.titleMedium,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(10),
                            ],
                            decoration: InputDecoration(
                              hintText: l10n.phoneHint,
                            ),
                            onChanged: (_) {
                              if (_error != null) {
                                setState(() => _error = null);
                              }
                            },
                            validator: (value) {
                              if (value == null || value.trim().length < 7) {
                                return l10n.invalidPhone;
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Row(
                        key: const Key('login-error'),
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.error_outline,
                              size: 18, color: scheme.error),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _error!,
                              style: text.bodyMedium
                                  ?.copyWith(color: scheme.error),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('send-otp'),
                      onPressed: isSending ? null : _sendOtp,
                      child:
                          isSending ? const ButtonSpinner() : Text(l10n.sendOtp),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _sendOtp() {
    if (_formKey.currentState!.validate()) {
      setState(() => _error = null);
      final phone = '$_countryCode${_phoneController.text.trim()}';
      ref.read(driverAuthProvider.notifier).sendOtp(phone);
    }
  }
}
