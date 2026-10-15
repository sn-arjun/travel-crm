import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared/shared.dart' show composePhoneE164, isValidNational;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/country_codes.dart';
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
  Country _country = _startingCountry();
  String? _error;

  /// The agency's phone country (sent when the agency code was confirmed), else the phone's own region, else India.
  static Country _startingCountry() {
    String? agencyIso;
    try {
      agencyIso = HiveStorage.agencyPhoneCountry ?? HiveStorage.agencyCountry;
    } catch (_) {
      agencyIso = null;
    }
    String? deviceIso;
    try {
      deviceIso = WidgetsBinding.instance.platformDispatcher.locale.countryCode;
    } catch (_) {
      deviceIso = null;
    }
    return resolveDefaultCountry(agencyIso: agencyIso, deviceIso: deviceIso);
  }

  /// E.164 of what is typed: the trunk 0 dropped, the country's calling code in front.
  String _fullPhone() => composePhoneE164(_country.phone, _phoneController.text);

  @override
  void initState() {
    super.initState();
    try {
      final lastPhone = HiveStorage.lastPhone;
      if (lastPhone != null) {
        final parts = splitE164(lastPhone);
        if (parts != null) {
          _country = parts.country;
          _phoneController.text = parts.national;
        } else {
          _phoneController.text = nationalDigits(lastPhone);
        }
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
        context.push('/login/otp', extra: _fullPhone());
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
                    const SizedBox(height: 16),
                    _AgencyBanner(
                      name: _agencyName(),
                      onChange: _changeAgency,
                    ),
                    const SizedBox(height: 20),
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
                          width: 128,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: _pickCountry,
                            child: InputDecorator(
                              key: const Key('country-code'),
                              decoration: const InputDecoration(
                                suffixIcon: Icon(Icons.arrow_drop_down),
                                suffixIconConstraints:
                                    BoxConstraints(minWidth: 28),
                              ),
                              child: Text(
                                '${_country.flag} ${_country.dial}',
                                style: text.titleMedium,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
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
                              LengthLimitingTextInputFormatter(15),
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
                              if (value == null || !isValidNational(_country.phone, value)) {
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

  String _agencyName() {
    try {
      return HiveStorage.agencyName ?? '';
    } catch (_) {
      return '';
    }
  }

  Future<void> _changeAgency() async {
    await ref.read(driverAuthProvider.notifier).changeAgency();
    if (!mounted) return;
    context.go('/agency');
  }

  Future<void> _pickCountry() async {
    final picked = await showModalBottomSheet<Country>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => const _CountryPicker(),
    );
    if (picked != null && mounted) {
      setState(() => _country = picked);
    }
  }

  void _sendOtp() {
    if (_formKey.currentState!.validate()) {
      setState(() => _error = null);
      final phone = _fullPhone();
      ref.read(driverAuthProvider.notifier).sendOtp(phone);
    }
  }
}

/// Agency name with a "Change agency" button, shown above the phone field.
class _AgencyBanner extends StatelessWidget {
  final String name;
  final VoidCallback onChange;
  const _AgencyBanner({required this.name, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Row(
      key: const Key('agency-banner'),
      children: [
        Icon(Icons.business_rounded, size: 18, color: scheme.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            name.isEmpty ? l10n.agencyLabel : name,
            key: const Key('agency-banner-name'),
            style: text.titleSmall,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        TextButton(
          key: const Key('change-agency'),
          onPressed: onChange,
          child: Text(l10n.changeAgency),
        ),
      ],
    );
  }
}

/// Searchable list of every country; pops the chosen [Country].
class _CountryPicker extends StatefulWidget {
  const _CountryPicker();

  @override
  State<_CountryPicker> createState() => _CountryPickerState();
}

class _CountryPickerState extends State<_CountryPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final results = searchCountries(_query);
    final height = MediaQuery.of(context).size.height * 0.7;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                key: const Key('country-search'),
                decoration: InputDecoration(
                  hintText: l10n.countrySearchHint,
                  prefixIcon: const Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(
              child: results.isEmpty
                  ? Center(child: Text(l10n.noCountryFound))
                  : ListView.builder(
                      itemCount: results.length,
                      itemBuilder: (ctx, i) {
                        final c = results[i];
                        return ListTile(
                          key: Key('country-${c.iso}'),
                          leading: Text(c.flag, style: const TextStyle(fontSize: 22)),
                          title: Text(c.name),
                          trailing: Text(c.dial),
                          onTap: () => Navigator.pop(ctx, c),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
