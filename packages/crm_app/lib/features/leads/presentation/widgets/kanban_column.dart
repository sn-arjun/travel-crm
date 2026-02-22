import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../data/lead_provider.dart';
import 'lead_card.dart';
import 'lost_reason_dialog.dart';

class KanbanColumn extends ConsumerWidget {
  final PipelineStage stage;

  const KanbanColumn({super.key, required this.stage});

  Future<void> _onLeadDropped(BuildContext context, WidgetRef ref, LeadModel lead) async {
    if (lead.status == stage.name) return;

    String? lostReason;
    String? lostNotes;

    if (stage.name == 'lost') {
      final result = await LostReasonDialog.show(context);
      if (result == null) return;
      lostReason = result.reason;
      lostNotes = result.notes;
    }

    final oldStatus = lead.status;
    await ref.read(leadDetailProvider(lead.id).notifier).changeStatus(
          stage.name,
          lostReason: lostReason,
          lostReasonNotes: lostNotes,
        );

    // Optimistically update pipeline
    final updatedLead = lead.copyWith(status: stage.name);
    ref.read(pipelineProvider.notifier).updateLeadInStage(updatedLead, oldStatus);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Container(
      width: 300,
      margin: const EdgeInsets.only(right: AppTheme.spacingMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Column header
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.spacingMd,
              vertical: AppTheme.spacingSm,
            ),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    stage.label,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${stage.count}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (stage.totalValue > 0) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                'INR ${_formatValue(stage.totalValue)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
          const SizedBox(height: AppTheme.spacingSm),

          // Drop target + cards
          Expanded(
            child: DragTarget<LeadModel>(
              onAcceptWithDetails: (details) =>
                  _onLeadDropped(context, ref, details.data),
              builder: (context, candidateData, _) => Container(
                decoration: candidateData.isNotEmpty
                    ? BoxDecoration(
                        border: Border.all(
                          color: theme.colorScheme.primary,
                          width: 2,
                        ),
                        borderRadius: BorderRadius.circular(8),
                        color: theme.colorScheme.primary
                            .withValues(alpha: 0.05),
                      )
                    : null,
                child: stage.leads.isEmpty
                    ? Center(
                        child: Text(
                          'Drop here',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant
                                .withValues(alpha: 0.5),
                          ),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.only(
                            bottom: AppTheme.spacingMd),
                        itemCount: stage.leads.length,
                        itemBuilder: (_, i) =>
                            LeadCard(lead: stage.leads[i]),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatValue(double value) {
    if (value >= 100000) return '${(value / 100000).toStringAsFixed(1)}L';
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}K';
    return value.toStringAsFixed(0);
  }
}
