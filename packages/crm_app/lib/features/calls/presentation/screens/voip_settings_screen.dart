import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

// ── Providers ──────────────────────────────────────────────

final _settingsProvider =
    FutureProvider.autoDispose<VoipSettingsModel>((ref) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getSettings();
});

// ── Screen ────────────────────────────────────────────────

class VoipSettingsScreen extends ConsumerStatefulWidget {
  const VoipSettingsScreen({super.key});

  @override
  ConsumerState<VoipSettingsScreen> createState() => _VoipSettingsScreenState();
}

class _VoipSettingsScreenState extends ConsumerState<VoipSettingsScreen> {
  bool _saving = false;
  bool _testing = false;
  VoipConnectionTestResult? _testResult;

  // Controllers
  late TextEditingController _accountSidCtrl;
  late TextEditingController _authTokenCtrl;
  late TextEditingController _apiKeySidCtrl;
  late TextEditingController _apiKeySecretCtrl;
  late TextEditingController _twimlAppSidCtrl;
  late TextEditingController _callerIdCtrl;
  late TextEditingController _maxRingCtrl;
  late TextEditingController _voicemailUrlCtrl;

  // Dropdown values
  String _recordingPolicy = 'all';
  String _routingStrategy = 'assigned';
  bool _ivrEnabled = false;
  bool _businessHoursEnabled = false;
  bool _voicemailEnabled = true;

  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _accountSidCtrl = TextEditingController();
    _authTokenCtrl = TextEditingController();
    _apiKeySidCtrl = TextEditingController();
    _apiKeySecretCtrl = TextEditingController();
    _twimlAppSidCtrl = TextEditingController();
    _callerIdCtrl = TextEditingController();
    _maxRingCtrl = TextEditingController(text: '30');
    _voicemailUrlCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _accountSidCtrl.dispose();
    _authTokenCtrl.dispose();
    _apiKeySidCtrl.dispose();
    _apiKeySecretCtrl.dispose();
    _twimlAppSidCtrl.dispose();
    _callerIdCtrl.dispose();
    _maxRingCtrl.dispose();
    _voicemailUrlCtrl.dispose();
    super.dispose();
  }

  void _populateFields(VoipSettingsModel settings) {
    if (_initialized) return;
    _initialized = true;
    _accountSidCtrl.text = settings.twilioAccountSid ?? '';
    _authTokenCtrl.text = settings.twilioAuthToken ?? '';
    _apiKeySidCtrl.text = settings.twilioApiKeySid ?? '';
    _apiKeySecretCtrl.text = settings.twilioApiKeySecret ?? '';
    _twimlAppSidCtrl.text = settings.twilioTwimlAppSid ?? '';
    _callerIdCtrl.text = settings.defaultCallerId ?? '';
    _maxRingCtrl.text = settings.maxRingDuration.toString();
    _voicemailUrlCtrl.text = settings.voicemailGreetingUrl ?? '';
    _recordingPolicy = settings.recordingPolicy;
    _routingStrategy = settings.routingStrategy;
    _ivrEnabled = settings.ivrEnabled;
    _businessHoursEnabled = settings.businessHoursEnabled;
    _voicemailEnabled = settings.voicemailEnabled;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final data = <String, dynamic>{};
      if (_accountSidCtrl.text.isNotEmpty) {
        data['twilioAccountSid'] = _accountSidCtrl.text;
      }
      if (_authTokenCtrl.text.isNotEmpty &&
          !_authTokenCtrl.text.startsWith('****')) {
        data['twilioAuthToken'] = _authTokenCtrl.text;
      }
      if (_apiKeySidCtrl.text.isNotEmpty) {
        data['twilioApiKeySid'] = _apiKeySidCtrl.text;
      }
      if (_apiKeySecretCtrl.text.isNotEmpty &&
          !_apiKeySecretCtrl.text.startsWith('****')) {
        data['twilioApiKeySecret'] = _apiKeySecretCtrl.text;
      }
      if (_twimlAppSidCtrl.text.isNotEmpty) {
        data['twilioTwimlAppSid'] = _twimlAppSidCtrl.text;
      }
      if (_callerIdCtrl.text.isNotEmpty) {
        data['defaultCallerId'] = _callerIdCtrl.text;
      }
      data['recordingPolicy'] = _recordingPolicy;
      data['routingStrategy'] = _routingStrategy;
      data['ivrEnabled'] = _ivrEnabled;
      data['businessHoursEnabled'] = _businessHoursEnabled;
      data['voicemailEnabled'] = _voicemailEnabled;
      data['maxRingDuration'] = int.tryParse(_maxRingCtrl.text) ?? 30;
      if (_voicemailUrlCtrl.text.isNotEmpty) {
        data['voicemailGreetingUrl'] = _voicemailUrlCtrl.text;
      }

      await ref.read(voipRepositoryProvider).updateSettings(data);
      ref.invalidate(_settingsProvider);
      if (mounted) {
        AppSnackbar.success(context, 'VoIP settings saved');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _testConnection() async {
    setState(() {
      _testing = true;
      _testResult = null;
    });
    try {
      final result = await ref.read(voipRepositoryProvider).testConnection();
      setState(() => _testResult = result);
      if (mounted) {
        if (result.connected) {
          AppSnackbar.success(context,
              'Connected to ${result.accountName ?? 'Twilio'}');
        } else {
          AppSnackbar.error(context, result.error ?? 'Connection failed');
        }
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(_settingsProvider);
    final theme = Theme.of(context);

    return settingsAsync.when(
      loading: () => const AppLoading(),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (settings) {
        _populateFields(settings);
        return SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header with save button
              Row(
                children: [
                  Expanded(
                    child: Text('VoIP / Telephony Settings',
                        style: theme.textTheme.headlineSmall),
                  ),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save_outlined),
                    label: const Text('Save'),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── Twilio Credentials ────────────────────
              AppSectionCard(
                title: 'Twilio Credentials',
                child: Column(
                  children: [
                    _buildTextField(
                      controller: _accountSidCtrl,
                      label: 'Account SID',
                      hint: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    ),
                    const SizedBox(height: 16),
                    _buildTextField(
                      controller: _authTokenCtrl,
                      label: 'Auth Token',
                      hint: 'Your Twilio Auth Token',
                      obscure: true,
                    ),
                    const SizedBox(height: 16),
                    _buildTextField(
                      controller: _apiKeySidCtrl,
                      label: 'API Key SID',
                      hint: 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    ),
                    const SizedBox(height: 16),
                    _buildTextField(
                      controller: _apiKeySecretCtrl,
                      label: 'API Key Secret',
                      hint: 'Your Twilio API Key Secret',
                      obscure: true,
                    ),
                    const SizedBox(height: 16),
                    _buildTextField(
                      controller: _twimlAppSidCtrl,
                      label: 'TwiML App SID',
                      hint: 'APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _testing ? null : _testConnection,
                            icon: _testing
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2))
                                : const Icon(Icons.wifi_tethering),
                            label: const Text('Test Connection'),
                          ),
                        ),
                        if (_testResult != null) ...[
                          const SizedBox(width: 12),
                          Icon(
                            _testResult!.connected
                                ? Icons.check_circle
                                : Icons.error,
                            color: _testResult!.connected
                                ? Colors.green
                                : Colors.red,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _testResult!.connected
                                ? 'Connected'
                                : 'Failed',
                            style: TextStyle(
                              color: _testResult!.connected
                                  ? Colors.green
                                  : Colors.red,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ── Caller Settings ────────────────────────
              AppSectionCard(
                title: 'Caller Settings',
                child: Column(
                  children: [
                    _buildTextField(
                      controller: _callerIdCtrl,
                      label: 'Default Caller ID',
                      hint: '+1234567890 (E.164 format)',
                    ),
                    const SizedBox(height: 16),
                    _buildDropdown(
                      label: 'Recording Policy',
                      value: _recordingPolicy,
                      items: const {
                        'all': 'Record All Calls',
                        'inbound': 'Record Inbound Only',
                        'outbound': 'Record Outbound Only',
                        'none': 'No Recording',
                      },
                      onChanged: (v) =>
                          setState(() => _recordingPolicy = v ?? 'all'),
                    ),
                    const SizedBox(height: 16),
                    _buildDropdown(
                      label: 'Routing Strategy',
                      value: _routingStrategy,
                      items: const {
                        'assigned': 'Route to Assigned Agent',
                        'round_robin': 'Round Robin',
                        'least_recent': 'Least Recent',
                      },
                      onChanged: (v) =>
                          setState(() => _routingStrategy = v ?? 'assigned'),
                    ),
                    const SizedBox(height: 16),
                    _buildTextField(
                      controller: _maxRingCtrl,
                      label: 'Max Ring Duration (seconds)',
                      hint: '10-60',
                      keyboardType: TextInputType.number,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ── Call Features ──────────────────────────
              AppSectionCard(
                title: 'Call Features',
                child: Column(
                  children: [
                    SwitchListTile(
                      title: const Text('Voicemail'),
                      subtitle: const Text(
                          'Enable voicemail for unanswered calls'),
                      value: _voicemailEnabled,
                      onChanged: (v) =>
                          setState(() => _voicemailEnabled = v),
                    ),
                    if (_voicemailEnabled) ...[
                      const SizedBox(height: 8),
                      _buildTextField(
                        controller: _voicemailUrlCtrl,
                        label: 'Custom Greeting URL',
                        hint: 'https://example.com/greeting.mp3',
                      ),
                    ],
                    const Divider(height: 32),
                    SwitchListTile(
                      title: const Text('IVR Menu'),
                      subtitle: const Text(
                          'Interactive Voice Response for inbound calls'),
                      value: _ivrEnabled,
                      onChanged: (v) =>
                          setState(() => _ivrEnabled = v),
                    ),
                    const Divider(height: 32),
                    SwitchListTile(
                      title: const Text('Business Hours'),
                      subtitle: const Text(
                          'Route calls differently outside business hours'),
                      value: _businessHoursEnabled,
                      onChanged: (v) =>
                          setState(() => _businessHoursEnabled = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    String? hint,
    bool obscure = false,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: const OutlineInputBorder(),
      ),
    );
  }

  Widget _buildDropdown({
    required String label,
    required String value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: items.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: onChanged,
    );
  }
}
