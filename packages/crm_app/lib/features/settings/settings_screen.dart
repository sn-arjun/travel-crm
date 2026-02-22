import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../app/theme.dart';
import '../auth/data/auth_provider.dart';
import '../auth/data/biometric_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Settings',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Manage your account, team, and preferences',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // Account section
          _SectionHeader(title: 'Account'),
          const SizedBox(height: AppTheme.spacingSm),
          _SettingsTile(
            icon: Icons.person_outline_rounded,
            iconBg: const Color(0xFFEEF2FF),
            iconColor: AppTheme.primaryColor,
            title: 'Profile',
            subtitle: 'Manage your personal information',
            onTap: () => context.go('/settings/profile'),
          ),
          _SettingsTile(
            icon: Icons.devices_rounded,
            iconBg: const Color(0xFFF0FDF4),
            iconColor: AppTheme.successColor,
            title: 'Active Sessions',
            subtitle: 'View and manage your login sessions',
            onTap: () => context.go('/settings/sessions'),
          ),
          _SettingsTile(
            icon: Icons.history_rounded,
            iconBg: const Color(0xFFFFF7ED),
            iconColor: AppTheme.warningColor,
            title: 'Login History',
            subtitle: 'View your login activity',
            onTap: () => context.go('/settings/login-history'),
          ),
          // Biometric toggle — only shown on mobile
          if (defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS)
            _BiometricTile(),

          const SizedBox(height: AppTheme.spacingLg),

          // Organization section
          _SectionHeader(title: 'Organization'),
          const SizedBox(height: AppTheme.spacingSm),
          _SettingsTile(
            icon: Icons.group_outlined,
            iconBg: const Color(0xFFF0F9FF),
            iconColor: AppTheme.infoColor,
            title: 'Team Management',
            subtitle: 'Manage team members and roles',
            onTap: () => context.go('/settings/team'),
          ),
          _SettingsTile(
            icon: Icons.timeline_rounded,
            iconBg: const Color(0xFFFDF2F8),
            iconColor: const Color(0xFFEC4899),
            title: 'Activity Log',
            subtitle: 'View all system activity',
            onTap: () => context.go('/settings/activity-log'),
          ),
          _SettingsTile(
            icon: Icons.business_rounded,
            iconBg: const Color(0xFFF5F3FF),
            iconColor: const Color(0xFF8B5CF6),
            title: 'Company Settings',
            subtitle: 'Update company details and logo',
            onTap: () => context.go('/settings/company'),
          ),

          const SizedBox(height: AppTheme.spacingXl),

          // Session
          _SectionHeader(title: 'Session'),
          const SizedBox(height: AppTheme.spacingSm),
          Card(
            margin: EdgeInsets.zero,
            child: InkWell(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              onTap: () => _confirmLogout(context, ref),
              child: Padding(
                padding: const EdgeInsets.all(AppTheme.spacingMd),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      ),
                      child: Icon(Icons.logout_rounded, color: theme.colorScheme.error, size: 22),
                    ),
                    const SizedBox(width: AppTheme.spacingMd),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Sign Out',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: theme.colorScheme.error,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Sign out of your account on this device',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurfaceVariant),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will be redirected to the login screen.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(authProvider.notifier).logout();
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }
}

// ── Section Header ────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Text(
          title.toUpperCase(),
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurfaceVariant,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(width: AppTheme.spacingSm),
        Expanded(child: Divider(color: theme.dividerColor)),
      ],
    );
  }
}

// ── Settings Tile ─────────────────────────────────────────

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingsTile({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMd),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  child: Icon(icon, color: iconColor, size: 22),
                ),
                const SizedBox(width: AppTheme.spacingMd),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Biometric Toggle Tile ─────────────────────────────────

class _BiometricTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final available = ref.watch(biometricAvailableProvider);
    final enabled = ref.watch(biometricEnabledProvider);

    // Only show if biometric hardware is available
    if (available.valueOrNull != true) return const SizedBox.shrink();

    final isEnabled = enabled.valueOrNull ?? false;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                child: const Icon(Icons.fingerprint_rounded, color: Color(0xFF16A34A), size: 22),
              ),
              const SizedBox(width: AppTheme.spacingMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Biometric Login', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      'Use fingerprint or face to sign in',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: isEnabled,
                onChanged: (v) => ref.read(biometricEnabledProvider.notifier).setEnabled(v),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
