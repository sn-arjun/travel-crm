import 'package:flutter/material.dart';

class ActivityLogScreen extends StatelessWidget {
  const ActivityLogScreen({super.key});

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
              Text('Activity Log', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              Row(
                children: [
                  DropdownButton<String>(
                    hint: const Text('All Actions'),
                    items: const [
                      DropdownMenuItem(value: 'login', child: Text('Login')),
                      DropdownMenuItem(value: 'create', child: Text('Create')),
                      DropdownMenuItem(value: 'update', child: Text('Update')),
                      DropdownMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                    onChanged: (_) {},
                  ),
                ],
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
                    Icon(Icons.history_outlined, size: 64, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
                    const SizedBox(height: 16),
                    Text('No activity logs yet', style: theme.textTheme.bodyLarge),
                    const SizedBox(height: 8),
                    Text('Activity will appear here as users perform actions', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
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
