import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/storage/hive_storage.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../auth/data/driver_auth_provider.dart';
import '../../data/profile_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final semantic = AppSemantic.of(context);
    final state = ref.watch(profileProvider);
    final profile = state.profile;

    if (state.isLoading && profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.profile)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (profile == null && state.error != null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.profile)),
        body: StateMessage(
          key: const Key('profile-error'),
          icon: Icons.cloud_off_outlined,
          isError: true,
          title: l10n.profileLoadError,
          actionLabel: l10n.retry,
          onAction: () => ref.read(profileProvider.notifier).loadProfile(),
        ),
      );
    }

    final name = (profile?['name'] ?? HiveStorage.driverName ?? '').toString();
    final phone =
        (profile?['phone'] ?? HiveStorage.driverPhone ?? '').toString();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.profile),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: l10n.editProfile,
            onPressed: () => context.push('/profile/edit'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(profileProvider.notifier).loadProfile(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            // Avatar + name
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 44,
                      backgroundColor: scheme.primaryContainer,
                      backgroundImage: profile?['photoUrl'] != null
                          ? NetworkImage(profile!['photoUrl'])
                          : null,
                      child: profile?['photoUrl'] == null
                          ? (name.isNotEmpty
                              ? Text(
                                  String.fromCharCode(name.runes.first).toUpperCase(),
                                  style: text.headlineMedium?.copyWith(
                                      color: scheme.onPrimaryContainer),
                                )
                              : Icon(Icons.person,
                                  size: 44, color: scheme.onPrimaryContainer))
                          : null,
                    ),
                    const SizedBox(height: 12),
                    Text(name, style: text.titleLarge),
                    const SizedBox(height: 2),
                    Text(
                      phone,
                      style: text.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Stats row
            Row(
              children: [
                _StatCard(
                  icon: Icons.star_rounded,
                  label: l10n.rating,
                  value: '${profile?['rating'] ?? '—'}',
                  tone: semantic.warning,
                ),
                const SizedBox(width: 12),
                _StatCard(
                  icon: Icons.directions_car,
                  label: l10n.totalTrips,
                  value: '${profile?['totalTrips'] ?? 0}',
                  tone: SemanticTone(
                    color: scheme.primary,
                    container: scheme.primaryContainer,
                    onContainer: scheme.onPrimaryContainer,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Info
            if (profile?['email'] != null ||
                profile?['address'] != null ||
                profile?['emergencyContactName'] != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      if (profile?['email'] != null)
                        _InfoTile(
                          icon: Icons.email_outlined,
                          label: l10n.email,
                          value: profile!['email'],
                        ),
                      if (profile?['address'] != null)
                        _InfoTile(
                          icon: Icons.location_on_outlined,
                          label: l10n.address,
                          value: profile!['address'],
                        ),
                      if (profile?['emergencyContactName'] != null)
                        _InfoTile(
                          icon: Icons.emergency_outlined,
                          label: l10n.emergencyContact,
                          value:
                              '${profile!['emergencyContactName']} — ${profile['emergencyContactPhone'] ?? ''}',
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),

            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text(l10n.documents),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/profile/documents'),
                  ),
                  const Divider(),
                  ListTile(
                    leading: const Icon(Icons.language),
                    title: Text(l10n.language),
                    subtitle: Text(_currentLanguageName(l10n)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _showLanguagePicker(context, ref, l10n),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Logout
            Card(
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                leading: Icon(Icons.logout, color: scheme.error),
                title: Text(l10n.logout, style: TextStyle(color: scheme.error)),
                onTap: () => _confirmLogout(context, ref, l10n),
              ),
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
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.language, style: Theme.of(ctx).textTheme.titleLarge),
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
            style: FilledButton.styleFrom(
              minimumSize: const Size(96, 44),
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
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
  final SemanticTone tone;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.tone,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: tone.container,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: tone.color, size: 24),
              ),
              const SizedBox(height: 10),
              Text(value, style: text.headlineSmall),
              const SizedBox(height: 2),
              Text(label,
                  style:
                      text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
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
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: scheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: text.labelMedium
                        ?.copyWith(color: scheme.onSurfaceVariant)),
                Text(value, style: text.bodyLarge),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
