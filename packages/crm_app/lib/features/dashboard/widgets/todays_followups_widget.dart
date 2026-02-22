import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/layout/app_section_card.dart';

/// Shows today's and overdue follow-up counts + a link to /follow-ups.
class TodaysFollowUpsWidget extends StatelessWidget {
  final int todayCount;
  final int overdueCount;

  const TodaysFollowUpsWidget({
    super.key,
    required this.todayCount,
    required this.overdueCount,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppSectionCard(
      title: 'Follow-Ups',
      trailing: TextButton(
        onPressed: () => context.go('/follow-ups'),
        child: const Text('View all'),
      ),
      child: Row(
        children: [
          Expanded(
            child: _CountChip(
              label: 'Today',
              count: todayCount,
              color: theme.colorScheme.primary,
              icon: Icons.today_outlined,
              onTap: () => context.go('/follow-ups'),
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          Expanded(
            child: _CountChip(
              label: 'Overdue',
              count: overdueCount,
              color: theme.colorScheme.error,
              icon: Icons.warning_amber_outlined,
              onTap: () => context.go('/follow-ups'),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  const _CountChip({
    required this.label,
    required this.count,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      child: Container(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: AppTheme.spacingXs),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$count',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: color,
                        fontWeight: FontWeight.bold,
                      ),
                ),
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: color,
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
