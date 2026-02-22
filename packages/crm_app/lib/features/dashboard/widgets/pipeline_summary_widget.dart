import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/layout/app_section_card.dart';

/// A custom bar chart showing lead count per pipeline stage.
///
/// Bars are proportional to count. Tapping navigates to /leads.
class PipelineSummaryWidget extends StatelessWidget {
  final Map<String, int> pipelineCounts;

  static const _stageOrder = [
    'new',
    'contacted',
    'requirement_gathered',
    'proposal_sent',
    'negotiation',
    'booking_confirmed',
    'completed',
    'lost',
  ];

  static const _stageLabels = {
    'new': 'New',
    'contacted': 'Contacted',
    'requirement_gathered': 'Req.',
    'proposal_sent': 'Proposal',
    'negotiation': 'Negotiation',
    'booking_confirmed': 'Booked',
    'completed': 'Done',
    'lost': 'Lost',
  };

  const PipelineSummaryWidget({super.key, required this.pipelineCounts});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxCount =
        pipelineCounts.values.fold<int>(1, (a, b) => a > b ? a : b);

    return AppSectionCard(
      title: 'Pipeline',
      trailing: TextButton(
        onPressed: () => context.go('/leads'),
        child: const Text('View all'),
      ),
      child: SizedBox(
        height: 100,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: _stageOrder.map((stage) {
            final count = pipelineCounts[stage] ?? 0;
            final fraction = maxCount > 0 ? count / maxCount : 0.0;
            final isLost = stage == 'lost';

            return Expanded(
              child: GestureDetector(
                onTap: () => context.go('/leads'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        '$count',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 600),
                        curve: Curves.easeOut,
                        height: 60 * fraction + 4,
                        decoration: BoxDecoration(
                          color: isLost
                              ? theme.colorScheme.error.withValues(alpha: 0.6)
                              : theme.colorScheme.primary
                                  .withValues(alpha: 0.7 + 0.3 * fraction),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(3),
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _stageLabels[stage] ?? stage,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontSize: 8,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
