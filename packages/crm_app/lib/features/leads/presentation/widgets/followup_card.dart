import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/followup_provider.dart';

/// A card displaying a single follow-up with its status, type, and datetime.
///
/// Pending follow-ups show a "Complete" action on tap.
class FollowUpCard extends ConsumerWidget {
  final FollowUpModel followUp;

  const FollowUpCard({super.key, required this.followUp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final (color, statusLabel) = _statusStyle(followUp.status);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        onTap: followUp.status == 'pending'
            ? () => _complete(context, ref)
            : null,
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              // Type icon with colored background
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(_typeIcon(followUp.type), color: color, size: 20),
              ),
              const SizedBox(width: AppTheme.spacingMd),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      followUp.leadTitle ?? 'Lead',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (followUp.contactName != null)
                      Text(
                        followUp.contactName!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    const SizedBox(height: 2),
                    Text(
                      followUp.scheduledAt,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (followUp.notes != null && followUp.notes!.isNotEmpty)
                      Text(
                        followUp.notes!,
                        style: theme.textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              // Status badge
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.radiusXs),
                ),
                child: Text(
                  statusLabel,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: color, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _complete(BuildContext context, WidgetRef ref) async {
    final notesCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete Follow-up'),
        content: TextField(
          controller: notesCtrl,
          decoration: const InputDecoration(
            labelText: 'Outcome notes (optional)',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
    notesCtrl.dispose();

    if (confirmed != true) return;
    if (!context.mounted) return;

    try {
      final repo = ref.read(followUpRepositoryProvider);
      await repo.completeFollowUp(
        followUp.id,
        outcomeNotes: notesCtrl.text.trim().isEmpty
            ? null
            : notesCtrl.text.trim(),
      );
      ref.read(myFollowUpsProvider.notifier).loadAll();
      if (!context.mounted) return;
      AppSnackbar.success(context, 'Follow-up completed');
    } catch (_) {
      if (!context.mounted) return;
      AppSnackbar.error(context, 'Failed to complete follow-up');
    }
  }

  static (Color, String) _statusStyle(String status) => switch (status) {
        'completed' => (const Color(0xFF4CAF50), 'Completed'),
        'missed' => (const Color(0xFFF44336), 'Missed'),
        _ => (const Color(0xFFFFA726), 'Pending'),
      };

  static IconData _typeIcon(String type) => switch (type) {
        'email' => Icons.email_outlined,
        'whatsapp' => Icons.message_outlined,
        'visit' => Icons.place_outlined,
        'sms' => Icons.sms_outlined,
        _ => Icons.phone_outlined,
      };
}
