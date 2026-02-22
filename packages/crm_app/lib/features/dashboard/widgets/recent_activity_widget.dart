import 'package:flutter/material.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/layout/app_section_card.dart';

/// Shows the last 10 lead activities in reverse-chronological order.
class RecentActivityWidget extends StatelessWidget {
  final List<LeadActivity> activities;

  const RecentActivityWidget({super.key, required this.activities});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppSectionCard(
      title: 'Recent Activity',
      child: activities.isEmpty
          ? const Padding(
              padding: EdgeInsets.symmetric(vertical: AppTheme.spacingSm),
              child: Text('No recent activity.'),
            )
          : Column(
              children: activities.map((a) {
                final (icon, color) = _styleFor(a.type);
                return Padding(
                  padding:
                      const EdgeInsets.only(bottom: AppTheme.spacingSm),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(icon, size: 14, color: color),
                      ),
                      const SizedBox(width: AppTheme.spacingSm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _labelFor(a.type),
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (a.createdByName != null)
                              Text(
                                '${a.createdByName} · ${a.createdAt ?? ''}',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color:
                                      theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
    );
  }

  static (IconData, Color) _styleFor(String type) => switch (type) {
        'note' => (Icons.note_outlined, const Color(0xFF5C6BC0)),
        'call' => (Icons.phone_outlined, const Color(0xFF26A69A)),
        'email' => (Icons.email_outlined, const Color(0xFF42A5F5)),
        'whatsapp' => (Icons.message_outlined, const Color(0xFF66BB6A)),
        'status_change' => (Icons.swap_horiz, const Color(0xFFFFA726)),
        'created' => (Icons.add_circle_outline, const Color(0xFF4CAF50)),
        'assigned' => (Icons.person_add_outlined, const Color(0xFF29B6F6)),
        _ => (Icons.history, const Color(0xFF9E9E9E)),
      };

  static String _labelFor(String type) => switch (type) {
        'note' => 'Note added',
        'call' => 'Call logged',
        'email' => 'Email sent',
        'whatsapp' => 'WhatsApp sent',
        'status_change' => 'Status changed',
        'created' => 'Lead created',
        'assigned' => 'Lead assigned',
        _ => type,
      };
}
