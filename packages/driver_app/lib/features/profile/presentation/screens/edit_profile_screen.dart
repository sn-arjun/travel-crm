import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/profile_provider.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  late final TextEditingController _addressController;
  late final TextEditingController _emergencyNameController;
  late final TextEditingController _emergencyPhoneController;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final profile = ref.read(profileProvider).profile;
    _emailController = TextEditingController(text: profile?['email'] ?? '');
    _addressController =
        TextEditingController(text: profile?['address'] ?? '');
    _emergencyNameController =
        TextEditingController(text: profile?['emergencyContactName'] ?? '');
    _emergencyPhoneController =
        TextEditingController(text: profile?['emergencyContactPhone'] ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _addressController.dispose();
    _emergencyNameController.dispose();
    _emergencyPhoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.editProfile),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                labelText: l10n.email,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _addressController,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: l10n.address,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              l10n.emergencyContact,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _emergencyNameController,
              decoration: InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _emergencyPhoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: l10n.phoneHint,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.save, style: const TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);

    final ok = await ref.read(profileProvider.notifier).updateProfile({
      'email': _emailController.text.trim(),
      'address': _addressController.text.trim(),
      'emergencyContactName': _emergencyNameController.text.trim(),
      'emergencyContactPhone': _emergencyPhoneController.text.trim(),
    });

    if (!mounted) return;
    setState(() => _saving = false);

    if (ok) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.success),
          backgroundColor: AppColors.success,
        ),
      );
      context.pop();
    }
  }
}
