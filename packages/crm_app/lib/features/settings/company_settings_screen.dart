import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../auth/data/auth_provider.dart';

// ── Provider ──────────────────────────────────────────────

final _companySettingsProvider =
    FutureProvider.autoDispose<Map<String, String?>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.companySettings);
  final data = response.data['data'] as Map<String, dynamic>;
  return data.map((k, v) => MapEntry(k, v?.toString()));
});

// ── Screen ────────────────────────────────────────────────

class CompanySettingsScreen extends ConsumerStatefulWidget {
  const CompanySettingsScreen({super.key});

  @override
  ConsumerState<CompanySettingsScreen> createState() => _CompanySettingsScreenState();
}

class _CompanySettingsScreenState extends ConsumerState<CompanySettingsScreen> {
  bool _editing = false;
  bool _saving = false;

  late TextEditingController _nameCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _websiteCtrl;
  late TextEditingController _addressCtrl;
  late TextEditingController _gstCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _currencyCtrl;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _phoneCtrl = TextEditingController();
    _websiteCtrl = TextEditingController();
    _addressCtrl = TextEditingController();
    _gstCtrl = TextEditingController();
    _emailCtrl = TextEditingController();
    _currencyCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _websiteCtrl.dispose();
    _addressCtrl.dispose();
    _gstCtrl.dispose();
    _emailCtrl.dispose();
    _currencyCtrl.dispose();
    super.dispose();
  }

  void _startEditing(Map<String, String?> settings) {
    _nameCtrl.text = settings['company_name'] ?? '';
    _phoneCtrl.text = settings['company_phone'] ?? '';
    _websiteCtrl.text = settings['company_website'] ?? '';
    _addressCtrl.text = settings['company_address'] ?? '';
    _gstCtrl.text = settings['company_gst'] ?? '';
    _emailCtrl.text = settings['company_email'] ?? '';
    _currencyCtrl.text = settings['default_currency'] ?? 'INR';
    setState(() => _editing = true);
  }

  void _cancelEditing() => setState(() => _editing = false);

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.put(ApiEndpoints.companySettings, data: {
        'company_name': _nameCtrl.text.trim(),
        'company_phone': _phoneCtrl.text.trim(),
        'company_website': _websiteCtrl.text.trim(),
        'company_address': _addressCtrl.text.trim(),
        'company_gst': _gstCtrl.text.trim(),
        'company_email': _emailCtrl.text.trim(),
        'default_currency': _currencyCtrl.text.trim().isEmpty ? 'INR' : _currencyCtrl.text.trim(),
      });
      ref.invalidate(_companySettingsProvider);
      if (mounted) {
        setState(() => _editing = false);
        AppSnackbar.success(context, 'Company settings saved');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e is ApiException ? e.message : 'Failed to save settings');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_companySettingsProvider);
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Company Settings', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    Text('Update your company information', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              if (!_editing)
                async.whenOrNull(
                  data: (settings) => FilledButton.icon(
                    onPressed: () => _startEditing(settings),
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Edit'),
                  ),
                ) ?? const SizedBox.shrink()
              else
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OutlinedButton(onPressed: _cancelEditing, child: const Text('Cancel')),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Save'),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingLg),
          async.when(
            loading: () => const AppLoading(message: 'Loading company settings...'),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (settings) => Column(
              children: [
                // Logo Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Row(
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppTheme.primaryColor, AppTheme.primaryLight],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                          ),
                          child: Center(
                            child: Text(
                              (settings['company_name'] ?? 'C').isNotEmpty
                                  ? (settings['company_name'] ?? 'C')[0].toUpperCase()
                                  : 'C',
                              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingLg),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                settings['company_name']?.isNotEmpty == true ? settings['company_name']! : 'Your Company',
                                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                settings['company_email']?.isNotEmpty == true ? settings['company_email']! : 'No email set',
                                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacingMd),

                // Details Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Company Details', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        const Divider(),
                        const SizedBox(height: AppTheme.spacingSm),
                        if (_editing) ...[
                          _EditField(label: 'Company Name', controller: _nameCtrl),
                          _EditField(label: 'Email', controller: _emailCtrl),
                          _EditField(label: 'Phone', controller: _phoneCtrl),
                          _EditField(label: 'Website', controller: _websiteCtrl),
                          _EditField(label: 'Address', controller: _addressCtrl, maxLines: 3),
                          _EditField(label: 'GST Number', controller: _gstCtrl),
                          _EditField(label: 'Default Currency', controller: _currencyCtrl),
                        ] else ...[
                          _DetailRow(icon: Icons.business_rounded, label: 'Company Name', value: settings['company_name'] ?? '-'),
                          _DetailRow(icon: Icons.email_outlined, label: 'Email', value: settings['company_email'] ?? '-'),
                          _DetailRow(icon: Icons.phone_outlined, label: 'Phone', value: settings['company_phone'] ?? '-'),
                          _DetailRow(icon: Icons.language_rounded, label: 'Website', value: settings['company_website'] ?? '-'),
                          _DetailRow(icon: Icons.location_on_outlined, label: 'Address', value: settings['company_address'] ?? '-'),
                          _DetailRow(icon: Icons.receipt_long_rounded, label: 'GST Number', value: settings['company_gst'] ?? '-'),
                          _DetailRow(icon: Icons.currency_exchange_rounded, label: 'Currency', value: settings['default_currency'] ?? 'INR'),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Detail Row ───────────────────────────────────────────

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _DetailRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          SizedBox(width: 140, child: Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant))),
          Expanded(child: Text(value, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

// ── Edit Field ───────────────────────────────────────────

class _EditField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final int maxLines;
  const _EditField({required this.label, required this.controller, this.maxLines = 1});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label),
      ),
    );
  }
}
