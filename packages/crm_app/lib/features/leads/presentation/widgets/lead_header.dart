import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/lead_provider.dart';
import 'priority_badge.dart';
import 'status_change_dropdown.dart';

/// Header card shown at the top of [LeadDetailScreen].
///
/// Displays contact name, lead title, status dropdown, priority badge,
/// assignee chip, and edit / delete actions.
class LeadHeader extends ConsumerWidget {
  final LeadModel lead;

  const LeadHeader({super.key, required this.lead});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.all(16.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Contact name row + actions
            Row(
              children: [
                Expanded(
                  child: Text(
                    lead.contactName ?? 'Unknown Contact',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
                // Edit
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Edit Lead',
                  onPressed: () => context.push('/leads/${lead.id}/edit'),
                ),
                // Delete
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Delete Lead',
                  onPressed: () => _deleteLead(context, ref),
                ),
              ],
            ),

            // Title
            Text(
              lead.title,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),

            const SizedBox(height: AppTheme.spacingSm),

            // Status + Priority row
            Wrap(
              spacing: AppTheme.spacingSm,
              runSpacing: AppTheme.spacingXs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatusChangeDropdown(leadId: lead.id, currentStatus: lead.status),
                if (lead.priority != null) PriorityBadge(priority: lead.priority!),
              ],
            ),

            if (lead.assignedToName != null) ...[
              const SizedBox(height: AppTheme.spacingSm),
              Row(
                children: [
                  const Icon(Icons.person_outline, size: 16),
                  const SizedBox(width: 4),
                  Text(
                    lead.assignedToName!,
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _deleteLead(BuildContext context, WidgetRef ref) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Lead',
      message: 'Are you sure you want to delete "${lead.title}"? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    if (!context.mounted) return;
    await ref.read(leadListProvider.notifier).deleteLead(lead.id);
    if (!context.mounted) return;
    AppSnackbar.success(context, 'Lead deleted');
    context.pop();
  }
}
