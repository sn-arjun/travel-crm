import 'package:flutter/material.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';

class ActivityTimelineWidget extends StatelessWidget {
  final List<TimelineEntry> entries;
  const ActivityTimelineWidget({super.key, required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const Center(child: Text('No activity yet'));
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: entries.length,
      itemBuilder: (context, index) {
        final entry = entries[index];
        final isLast = index == entries.length - 1;
        return _TimelineRow(entry: entry, isLast: isLast);
      },
    );
  }
}

class _TimelineRow extends StatelessWidget {
  final TimelineEntry entry;
  final bool isLast;
  const _TimelineRow({required this.entry, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _entryStyle(entry.type);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 40,
            child: Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, color: theme.dividerColor),
                  ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, size: 14, color: color),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          entry.title,
                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  if (entry.description != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(entry.description!, style: theme.textTheme.bodySmall),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '${entry.createdAt}${entry.createdByName != null ? '  \u2022  ${entry.createdByName}' : ''}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static (IconData, Color) _entryStyle(String type) {
    return switch (type) {
      'lead' => (Icons.trending_up, const Color(0xFF1E88E5)),
      'invoice' => (Icons.receipt_long_outlined, const Color(0xFF26A69A)),
      'payment' => (Icons.payments_outlined, const Color(0xFF4CAF50)),
      'message' => (Icons.chat_bubble_outline, const Color(0xFFFFA726)),
      'activity' => (Icons.history, const Color(0xFF607D8B)),
      _ => (Icons.circle, const Color(0xFF9E9E9E)),
    };
  }
}
