import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/providers/marketing_providers.dart';

class BrandingSettingsScreen extends ConsumerStatefulWidget {
  const BrandingSettingsScreen({super.key});

  @override
  ConsumerState<BrandingSettingsScreen> createState() =>
      _BrandingSettingsScreenState();
}

class _BrandingSettingsScreenState
    extends ConsumerState<BrandingSettingsScreen> {
  final _agencyNameController = TextEditingController();
  final _agencyPhoneController = TextEditingController();
  final _agencyEmailController = TextEditingController();
  final _agencyWebsiteController = TextEditingController();
  final _taglineController = TextEditingController();
  String _primaryColor = '#1976D2';
  String _secondaryColor = '#424242';
  String _accentColor = '#FF9800';
  String _primaryFont = 'Roboto';
  String _secondaryFont = 'Open Sans';
  bool _loaded = false;

  static const _fonts = [
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Raleway',
    'Playfair Display',
    'Oswald',
  ];

  @override
  void dispose() {
    _agencyNameController.dispose();
    _agencyPhoneController.dispose();
    _agencyEmailController.dispose();
    _agencyWebsiteController.dispose();
    _taglineController.dispose();
    super.dispose();
  }

  void _populateFromState() {
    final brandingState = ref.read(brandingProvider);
    final branding = brandingState.branding;
    if (branding != null && !_loaded) {
      _agencyNameController.text = branding.agencyName ?? '';
      _agencyPhoneController.text = branding.agencyPhone ?? '';
      _agencyEmailController.text = branding.agencyEmail ?? '';
      _agencyWebsiteController.text = branding.agencyWebsite ?? '';
      _taglineController.text = branding.tagline ?? '';
      _primaryColor = branding.primaryColor;
      _secondaryColor = branding.secondaryColor;
      _accentColor = branding.accentColor;
      _primaryFont = branding.primaryFont;
      _secondaryFont = branding.secondaryFont;
      _loaded = true;
    }
  }

  Future<void> _save() async {
    final notifier = ref.read(brandingProvider.notifier);
    await notifier.updateBranding({
      'agencyName': _agencyNameController.text,
      'agencyPhone': _agencyPhoneController.text,
      'agencyEmail': _agencyEmailController.text,
      'agencyWebsite': _agencyWebsiteController.text,
      'tagline': _taglineController.text,
      'primaryColor': _primaryColor,
      'secondaryColor': _secondaryColor,
      'accentColor': _accentColor,
      'primaryFont': _primaryFont,
      'secondaryFont': _secondaryFont,
    });

    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Branding saved!')));

  }

  @override
  Widget build(BuildContext context) {
    final brandingState = ref.watch(brandingProvider);
    _populateFromState();

    return Scaffold(
      body: brandingState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Brand Settings',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      ElevatedButton(
                        onPressed: _save,
                        child: const Text('Save'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Agency Info Section
                  Text(
                    'Agency Information',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _agencyNameController,
                    decoration: const InputDecoration(
                      labelText: 'Agency Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _agencyPhoneController,
                          decoration: const InputDecoration(
                            labelText: 'Phone',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _agencyEmailController,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _agencyWebsiteController,
                    decoration: const InputDecoration(
                      labelText: 'Website',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _taglineController,
                    decoration: const InputDecoration(
                      labelText: 'Tagline',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Colors Section
                  Text(
                    'Brand Colors',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      _ColorField(
                        label: 'Primary',
                        value: _primaryColor,
                        onChanged: (v) => setState(() => _primaryColor = v),
                      ),
                      const SizedBox(width: 12),
                      _ColorField(
                        label: 'Secondary',
                        value: _secondaryColor,
                        onChanged: (v) => setState(() => _secondaryColor = v),
                      ),
                      const SizedBox(width: 12),
                      _ColorField(
                        label: 'Accent',
                        value: _accentColor,
                        onChanged: (v) => setState(() => _accentColor = v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Fonts Section
                  Text('Fonts', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _primaryFont,
                          decoration: const InputDecoration(
                            labelText: 'Primary Font',
                            border: OutlineInputBorder(),
                          ),
                          items: _fonts
                              .map(
                                (f) =>
                                    DropdownMenuItem(value: f, child: Text(f)),
                              )
                              .toList(),
                          onChanged: (v) =>
                              setState(() => _primaryFont = v ?? 'Roboto'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _secondaryFont,
                          decoration: const InputDecoration(
                            labelText: 'Secondary Font',
                            border: OutlineInputBorder(),
                          ),
                          items: _fonts
                              .map(
                                (f) =>
                                    DropdownMenuItem(value: f, child: Text(f)),
                              )
                              .toList(),
                          onChanged: (v) =>
                              setState(() => _secondaryFont = v ?? 'Open Sans'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}

class _ColorField extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  const _ColorField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: _parseColor(value),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: Colors.grey[300]!),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: TextEditingController(text: value),
              decoration: InputDecoration(
                labelText: label,
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }

  Color _parseColor(String hex) {
    try {
      return Color(int.parse(hex.replaceFirst('#', '0xFF')));
    } catch (_) {
      return Colors.grey;
    }
  }
}
