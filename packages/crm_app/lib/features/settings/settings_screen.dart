import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Settings', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),

          // Account section
          Text('Account', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.person_outline,
            title: 'Profile',
            subtitle: 'Manage your personal information',
            onTap: () => context.go('/settings/profile'),
          ),
          _SettingsTile(
            icon: Icons.devices,
            title: 'Active Sessions',
            subtitle: 'View and manage your login sessions',
            onTap: () => context.go('/settings/sessions'),
          ),
          _SettingsTile(
            icon: Icons.history,
            title: 'Login History',
            subtitle: 'View your login activity',
            onTap: () => context.go('/settings/login-history'),
          ),

          const SizedBox(height: 24),

          // Organization section
          Text('Organization', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.group_outlined,
            title: 'Team Management',
            subtitle: 'Manage team members and roles',
            onTap: () => context.go('/settings/team'),
          ),
          _SettingsTile(
            icon: Icons.timeline,
            title: 'Activity Log',
            subtitle: 'View all system activity',
            onTap: () => context.go('/settings/activity-log'),
          ),
          _SettingsTile(
            icon: Icons.business_outlined,
            title: 'Company Settings',
            subtitle: 'Update company details and logo',
            onTap: () => context.go('/settings/company'),
          ),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
