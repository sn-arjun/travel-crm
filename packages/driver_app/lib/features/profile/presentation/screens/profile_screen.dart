import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/hive_storage.dart';
import '../../../auth/data/driver_auth_provider.dart';
import '../../data/profile_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(profileProvider);
    final profile = state.profile;

    if (state.isLoading && profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.profile)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.profile),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => context.push('/profile/edit'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(profileProvider.notifier).loadProfile(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Avatar + name
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                    backgroundImage: profile?['photoUrl'] != null
                        ? NetworkImage(profile!['photoUrl'])
                        : null,
                    child: profile?['photoUrl'] == null
                        ? const Icon(Icons.person,
                            size: 50, color: AppColors.primary)
                        : null,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    profile?['name'] ?? HiveStorage.driverName ?? '',
                    style: const TextStyle(
                        fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    profile?['phone'] ?? HiveStorage.driverPhone ?? '',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Stats row
            Row(
              children: [
                _StatCard(
                  icon: Icons.star,
                  label: l10n.rating,
                  value: '${profile?['rating'] ?? '—'}',
                  color: AppColors.warning,
                ),
                const SizedBox(width: 12),
                _StatCard(
                  icon: Icons.directions_car,
                  label: l10n.totalTrips,
                  value: '${profile?['totalTrips'] ?? 0}',
                  color: AppColors.primary,
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Info sections
            if (profile?['email'] != null) ...[
              _InfoTile(
                icon: Icons.email_outlined,
                label: l10n.email,
                value: profile!['email'],
              ),
            ],
            if (profile?['address'] != null) ...[
              _InfoTile(
                icon: Icons.location_on_outlined,
                label: l10n.address,
                value: profile!['address'],
              ),
            ],
            if (profile?['emergencyContactName'] != null) ...[
              _InfoTile(
                icon: Icons.emergency_outlined,
                label: l10n.emergencyContact,
                value:
                    '${profile!['emergencyContactName']} — ${profile['emergencyContactPhone'] ?? ''}',
              ),
            ],
            const Divider(height: 32),

            // Documents
            ListTile(
              leading: const Icon(Icons.description_outlined),
              title: Text(l10n.documents),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile/documents'),
            ),

            // Language
            ListTile(
              leading: const Icon(Icons.language),
              title: Text(l10n.language),
              subtitle: Text(_currentLanguageName(l10n)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showLanguagePicker(context, ref, l10n),
            ),
            const Divider(height: 32),

            // Logout
            ListTile(
              leading: const Icon(Icons.logout, color: AppColors.error),
              title: Text(l10n.logout,
                  style: const TextStyle(color: AppColors.error)),
              onTap: () => _confirmLogout(context, ref, l10n),
            ),
          ],
        ),
      ),
    );
  }

  String _currentLanguageName(AppLocalizations l10n) {
    switch (HiveStorage.locale) {
      case 'ar':
        return l10n.arabic;
      case 'hi':
        return l10n.hindi;
      default:
        return l10n.english;
    }
  }

  void _showLanguagePicker(
      BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Text(l10n.language,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            RadioGroup<String>(
              groupValue: HiveStorage.locale,
              onChanged: (v) {
                if (v == null) return;
                HiveStorage.locale = v;
                Navigator.pop(ctx);
              },
              child: Column(
                children: [
                  RadioListTile<String>(
                    title: Text(l10n.english),
                    value: 'en',
                  ),
                  RadioListTile<String>(
                    title: Text(l10n.arabic),
                    value: 'ar',
                  ),
                  RadioListTile<String>(
                    title: Text(l10n.hindi),
                    value: 'hi',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _confirmLogout(
      BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.logout),
        content: Text(l10n.logoutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(driverAuthProvider.notifier).logout();
              context.go('/login');
            },
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: Text(l10n.logout),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 8),
              Text(
                value,
                style:
                    const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey[600]),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600])),
              Text(value, style: const TextStyle(fontSize: 14)),
            ],
          ),
        ],
      ),
    );
  }
}
