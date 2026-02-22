import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../data/lead_provider.dart';
import 'lost_reason_dialog.dart';

class LeadStageProgress extends ConsumerWidget {
  final String currentStatus;
  final String leadId;

  const LeadStageProgress({
    super.key,
    required this.currentStatus,
    required this.leadId,
  });

  static const _stages = [
    LeadStatus.new_,
    LeadStatus.contacted,
    LeadStatus.requirementGathered,
    LeadStatus.proposalSent,
    LeadStatus.negotiation,
    LeadStatus.bookingConfirmed,
    LeadStatus.completed,
  ];

  Future<void> _tapStage(BuildContext context, WidgetRef ref, LeadStatus stage) async {
    if (stage.apiValue == currentStatus) return;

    String? lostReason;
    String? lostNotes;

    if (stage == LeadStatus.lost) {
      final result = await LostReasonDialog.show(context);
      if (result == null) return;
      lostReason = result.reason;
      lostNotes = result.notes;
    }

    await ref.read(leadDetailProvider(leadId).notifier).changeStatus(
          stage.apiValue,
          lostReason: lostReason,
          lostReasonNotes: lostNotes,
        );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final currentIdx = _stages.indexWhere((s) => s.apiValue == currentStatus);

    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(_stages.length * 2 - 1, (i) {
            if (i.isOdd) {
              // Connector line
              final stageIdx = i ~/ 2;
              final isPast = stageIdx < currentIdx;
              return Container(
                width: 24,
                height: 2,
                color: isPast
                    ? theme.colorScheme.primary
                    : theme.colorScheme.outlineVariant,
              );
            }

            final stageIdx = i ~/ 2;
            final stage = _stages[stageIdx];
            final isCurrent = stage.apiValue == currentStatus;
            final isPast = stageIdx < currentIdx;

            return GestureDetector(
              onTap: () => _tapStage(context, ref, stage),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isCurrent
                          ? theme.colorScheme.primary
                          : isPast
                              ? theme.colorScheme.primary.withValues(alpha: 0.3)
                              : theme.colorScheme.surfaceContainerHighest,
                      border: isCurrent
                          ? Border.all(
                              color: theme.colorScheme.primary, width: 2)
                          : null,
                    ),
                    child: isPast
                        ? Icon(Icons.check,
                            size: 14, color: theme.colorScheme.primary)
                        : isCurrent
                            ? Icon(Icons.circle,
                                size: 10,
                                color: theme.colorScheme.onPrimary)
                            : null,
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    width: 64,
                    child: Text(
                      stage.label,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: isCurrent
                            ? theme.colorScheme.primary
                            : theme.colorScheme.onSurfaceVariant,
                        fontWeight: isCurrent ? FontWeight.w700 : null,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}
