import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/hive_storage.dart';
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

  @override
  void initState() {
    super.initState();
    final lastPhone = HiveStorage.lastPhone;
    if (lastPhone != null) {
      _phoneController.text = lastPhone;
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
    final authState = ref.watch(driverAuthProvider);

    ref.listen<DriverAuthState>(driverAuthProvider, (prev, next) {
      if (next.status == AuthStatus.otpSent) {
        context.push('/login/otp', extra: '$_countryCode${_phoneController.text.trim()}');
      } else if (next.status == AuthStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.error,
          ),
        );
        ref.read(driverAuthProvider.notifier).clearError();
      }
    });

    final isSending = authState.status == AuthStatus.sendingOtp;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(flex: 2),
                Icon(
                  Icons.directions_car_rounded,
                  size: 80,
                  color: AppColors.primary,
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.loginTitle,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.loginSubtitle,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Colors.grey[600],
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 40),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _countryCode,
                          isDense: true,
                          items: const [
                            DropdownMenuItem(value: '+91', child: Text('+91')),
                            DropdownMenuItem(value: '+971', child: Text('+971')),
                            DropdownMenuItem(value: '+966', child: Text('+966')),
                            DropdownMenuItem(value: '+1', child: Text('+1')),
                          ],
                          onChanged: (v) => setState(() => _countryCode = v!),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(10),
                        ],
                        decoration: InputDecoration(
                          hintText: l10n.phoneHint,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.length < 7) {
                            return l10n.invalidPhone;
                          }
                          return null;
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: isSending ? null : _sendOtp,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: isSending
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(l10n.sendOtp, style: const TextStyle(fontSize: 16)),
                ),
                const Spacer(flex: 3),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _sendOtp() {
    if (_formKey.currentState!.validate()) {
      final phone = '$_countryCode${_phoneController.text.trim()}';
      ref.read(driverAuthProvider.notifier).sendOtp(phone);
    }
  }
}
