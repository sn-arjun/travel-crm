import 'package:flutter/material.dart';

class UserManagementScreen extends StatelessWidget {
  const UserManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Team Members', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              FilledButton.icon(
                onPressed: () {
                  // TODO: Show invite dialog
                },
                icon: const Icon(Icons.person_add),
                label: const Text('Invite User'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Expanded(
            child: Card(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.group_outlined, size: 64, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
                    const SizedBox(height: 16),
                    Text('No team members yet', style: theme.textTheme.bodyLarge),
                    const SizedBox(height: 8),
                    Text('Invite your team to start collaborating', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
