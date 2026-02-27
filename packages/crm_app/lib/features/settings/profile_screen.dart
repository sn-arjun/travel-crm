import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../auth/data/auth_provider.dart';

// ── Locale Provider ───────────────────────────────────────

final localeProvider = StateProvider<Locale>((ref) {
  final user = ref.watch(authProvider).user;
  final lang = user?.language ?? 'en';
  return Locale(lang);
});

// ── Theme Mode Provider ──────────────────────────────────

final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.light);

// ── Screen ────────────────────────────────────────────────

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editing = false;
  bool _saving = false;
  bool _uploadingAvatar = false;
  late TextEditingController _nameCtrl;
  late TextEditingController _phoneCtrl;
  String _selectedDepartment = '';
  String _selectedLanguage = 'en';

  static const _departments = [
    ('', 'None'),
    ('sales', 'Sales'),
    ('marketing', 'Marketing'),
    ('operations', 'Operations'),
    ('finance', 'Finance'),
    ('hr', 'Human Resources'),
    ('support', 'Customer Support'),
    ('management', 'Management'),
  ];

  static const _languages = [
    ('en', 'English'),
    ('hi', 'Hindi'),
    ('ta', 'Tamil'),
    ('te', 'Telugu'),
    ('kn', 'Kannada'),
    ('ml', 'Malayalam'),
    ('mr', 'Marathi'),
    ('gu', 'Gujarati'),
    ('bn', 'Bengali'),
    ('ar', 'Arabic'),
  ];

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _phoneCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _startEditing(UserModel user) {
    _nameCtrl.text = user.name;
    _phoneCtrl.text = user.phone ?? '';
    _selectedDepartment = user.department ?? '';
    _selectedLanguage = user.language;
    setState(() => _editing = true);
  }

  void _cancelEditing() => setState(() => _editing = false);

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.put(ApiEndpoints.profile, data: {
        'name': _nameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        'department': _selectedDepartment.isEmpty ? null : _selectedDepartment,
        'language': _selectedLanguage,
      });
      // Re-fetch user profile to update sidebar/header
      await ref.read(authProvider.notifier).refreshProfile();
      // Update locale immediately
      ref.read(localeProvider.notifier).state = Locale(_selectedLanguage);
      if (mounted) {
        setState(() => _editing = false);
        AppSnackbar.success(context, 'Profile updated');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e is ApiException ? e.message : 'Failed to update profile');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Profile',
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5),
          ),
          const SizedBox(height: 8),
          Text('Manage your personal information', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: AppTheme.spacingLg),

          // Profile Header Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Row(
                children: [
                  // Avatar — shows image if avatarUrl exists, otherwise initial letter
                  _buildAvatar(user),
                  const SizedBox(width: AppTheme.spacingLg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.name ?? 'User', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(user?.email ?? '', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        const SizedBox(height: 8),
                        _RoleBadge(role: user?.role ?? 'user'),
                      ],
                    ),
                  ),
                  if (!_editing)
                    FilledButton.icon(
                      onPressed: user != null ? () => _startEditing(user) : null,
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('Edit'),
                    )
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
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),

          // Account Details
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Account Details', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Divider(),
                  const SizedBox(height: AppTheme.spacingSm),
                  if (_editing) ...[
                    _EditField(label: 'Name', controller: _nameCtrl),
                    _EditField(label: 'Phone', controller: _phoneCtrl),
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
                      child: DropdownButtonFormField<String>(
                        initialValue: _departments.any((d) => d.$1 == _selectedDepartment) ? _selectedDepartment : '',
                        decoration: const InputDecoration(labelText: 'Department'),
                        items: _departments.map((d) => DropdownMenuItem(value: d.$1, child: Text(d.$2))).toList(),
                        onChanged: (v) => setState(() => _selectedDepartment = v ?? ''),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
                      child: DropdownButtonFormField<String>(
                        initialValue: _languages.any((l) => l.$1 == _selectedLanguage) ? _selectedLanguage : 'en',
                        decoration: const InputDecoration(labelText: 'Language'),
                        items: _languages.map((l) => DropdownMenuItem(value: l.$1, child: Text(l.$2))).toList(),
                        onChanged: (v) => setState(() => _selectedLanguage = v ?? 'en'),
                      ),
                    ),
                  ] else ...[
                    _DetailRow(icon: Icons.email_outlined, label: 'Email', value: user?.email ?? '-'),
                    _DetailRow(icon: Icons.phone_outlined, label: 'Phone', value: user?.phone ?? '-'),
                    _DetailRow(
                      icon: Icons.work_outline_rounded,
                      label: 'Department',
                      value: _departments.where((d) => d.$1 == (user?.department ?? '')).firstOrNull?.$2 ?? user?.department ?? '-',
                    ),
                    _DetailRow(
                      icon: Icons.language_rounded,
                      label: 'Language',
                      value: _languages.where((l) => l.$1 == (user?.language ?? 'en')).firstOrNull?.$2 ?? user?.language ?? 'en',
                    ),
                    _DetailRow(icon: Icons.schedule_rounded, label: 'Last Login', value: user?.lastLoginAt ?? '-'),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAndUploadAvatar() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    if (file.bytes == null) return;

    setState(() => _uploadingAvatar = true);
    try {
      final api = ref.read(apiClientProvider);
      final formData = FormData.fromMap({
        'avatar': MultipartFile.fromBytes(
          file.bytes!,
          filename: file.name,
        ),
      });
      await api.upload(ApiEndpoints.profileAvatar, data: formData);
      await ref.read(authProvider.notifier).refreshProfile();
      if (mounted) AppSnackbar.success(context, 'Avatar updated');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e is ApiException ? e.message : 'Failed to upload avatar');
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Widget _buildAvatar(UserModel? user) {
    final rawUrl = user?.avatarUrl;
    final hasAvatar = rawUrl != null && rawUrl.isNotEmpty;
    final avatarUrl = hasAvatar
        ? (rawUrl.startsWith('http')
            ? rawUrl
            : '${AppConstants.apiBaseUrl}/api/v1$rawUrl')
        : null;
    return GestureDetector(
      onTap: _uploadingAvatar ? null : _pickAndUploadAvatar,
      child: Stack(
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: hasAvatar
                  ? null
                  : const LinearGradient(
                      colors: [AppTheme.primaryColor, AppTheme.primaryLight],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              image: hasAvatar
                  ? DecorationImage(
                      image: NetworkImage(avatarUrl!),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: _uploadingAvatar
                ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : hasAvatar
                    ? null
                    : Center(
                        child: Text(
                          (user?.name ?? 'U')[0].toUpperCase(),
                          style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white),
                        ),
                      ),
          ),
          if (!_uploadingAvatar)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: const Icon(Icons.camera_alt_rounded, size: 14, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

class _RoleBadge extends StatelessWidget {
  final String role;
  const _RoleBadge({required this.role});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (role) {
      'admin' => (const Color(0xFFFEF2F2), const Color(0xFFDC2626)),
      'sales_manager' => (const Color(0xFFF0F9FF), const Color(0xFF2563EB)),
      'salesperson' => (const Color(0xFFF0FDF4), const Color(0xFF16A34A)),
      _ => (const Color(0xFFF8FAFC), const Color(0xFF64748B)),
    };
    final label = role.replaceAll('_', ' ').split(' ').map((w) => '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}

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
          SizedBox(width: 120, child: Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant))),
          Expanded(child: Text(value, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

class _EditField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  const _EditField({required this.label, required this.controller});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: TextField(controller: controller, decoration: InputDecoration(labelText: label)),
    );
  }
}
