import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import 'priority_badge.dart';
import 'lead_quick_actions.dart';

class LeadCard extends ConsumerWidget {
  final LeadModel lead;
  final VoidCallback? onDragCompleted;

  const LeadCard({super.key, required this.lead, this.onDragCompleted});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    final card = Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: InkWell(
        onTap: () => context.push('/leads/${lead.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + Priority
              Row(
                children: [
                  Expanded(
                    child: Text(
                      lead.title,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (lead.priority != null)
                    PriorityBadge(
                        priority: lead.priority!, showLabel: false),
                ],
              ),
              const SizedBox(height: 4),

              // Contact
              if (lead.contactName != null)
                Text(
                  lead.contactName!,
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant),
                ),
              const SizedBox(height: 6),

              // Destinations
              if (lead.destinations.isNotEmpty)
                Wrap(
                  spacing: 4,
                  children: lead.destinations.take(2).map((d) {
                    return Chip(
                      label: Text(d, style: const TextStyle(fontSize: 11)),
                      padding: EdgeInsets.zero,
                      materialTapTargetSize:
                          MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    );
                  }).toList(),
                ),
              const SizedBox(height: 6),

              // Travel date + Budget
              Row(
                children: [
                  Icon(Icons.calendar_today_outlined,
                      size: 12,
                      color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text(
                    _formatDate(lead.travelDate),
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant),
                  ),
                  if (lead.budget != null) ...[
                    const Spacer(),
                    Text(
                      '${lead.currency} ${lead.budget!.toStringAsFixed(0)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),

              // Quick actions
              LeadQuickActions(lead: lead),
            ],
          ),
        ),
      ),
    );

    return Draggable<LeadModel>(
      data: lead,
      onDragCompleted: onDragCompleted,
      feedback: SizedBox(
        width: 280,
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(12),
          child: card,
        ),
      ),
      childWhenDragging: Opacity(opacity: 0.4, child: card),
      child: card,
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}
