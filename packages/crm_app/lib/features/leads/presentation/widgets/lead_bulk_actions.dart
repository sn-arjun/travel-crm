import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../features/auth/data/auth_provider.dart';
import '../../data/lead_provider.dart';
import 'lost_reason_dialog.dart';

/// An animated bottom bar that appears when one or more leads are selected.
///
/// Actions: Assign, Change Status, Delete (with confirmation).
class LeadBulkActions extends ConsumerWidget {
  const LeadBulkActions({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(leadListProvider);
    final notifier = ref.read(leadListProvider.notifier);
    final count = state.selectedIds.length;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeInOut,
      height: count > 0 ? 72 : 0,
      child: count > 0
          ? Material(
              elevation: 8,
              color: Theme.of(context).colorScheme.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
                child: Row(
                  children: [
                    Text(
                      '$count selected',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const Spacer(),
                    // Assign
                    TextButton.icon(
                      icon: const Icon(Icons.person_add_outlined, size: 18),
                      label: const Text('Assign'),
                      onPressed: () => _showAssignDialog(context, ref),
                    ),
                    // Change Status
                    TextButton.icon(
                      icon: const Icon(Icons.swap_horiz, size: 18),
                      label: const Text('Status'),
                      onPressed: () => _showStatusDialog(context, ref),
                    ),
                    // Delete
                    TextButton.icon(
                      icon: const Icon(Icons.delete_outline,
                          size: 18, color: Colors.red),
                      label: const Text('Delete',
                          style: TextStyle(color: Colors.red)),
                      onPressed: () => _bulkDelete(context, notifier),
                    ),
                  ],
                ),
              ),
            )
          : const SizedBox.shrink(),
    );
  }

  Future<void> _showAssignDialog(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    List<Map<String, dynamic>> users = [];
    try {
      final resp = await api.get(
        ApiEndpoints.users,
        queryParameters: {
          'role': 'salesperson,sales_manager,admin',
          'isActive': '1',
          'pageSize': '100',
        },
      );
      final data = resp.data['data'] as Map<String, dynamic>?;
      final list = (data?['items'] ?? resp.data['data']) as List? ?? [];
      users = list.cast<Map<String, dynamic>>();
    } catch (_) {}

    if (!context.mounted) return;

    String? userId;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Assign To'),
        content: StatefulBuilder(
          builder: (ctx2, setS) => DropdownButtonFormField<String>(
            decoration: const InputDecoration(labelText: 'Select User'),
            items: users
                .map((u) => DropdownMenuItem(
                      value: u['id'] as String?,
                      child: Text(u['name'] as String? ?? ''),
                    ))
                .toList(),
            onChanged: (v) => setS(() => userId = v),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: userId == null
                ? null
                : () {
                    Navigator.pop(ctx);
                  },
            child: const Text('Assign'),
          ),
        ],
      ),
    );

    if (userId == null) return;
    if (!context.mounted) return;
    await ref.read(leadListProvider.notifier).bulkAssign(userId!);
    if (!context.mounted) return;
    AppSnackbar.success(context, 'Leads assigned');
  }

  Future<void> _showStatusDialog(BuildContext context, WidgetRef ref) async {
    String? newStatus;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change Status'),
        content: StatefulBuilder(
          builder: (ctx2, setS) => DropdownButtonFormField<String>(
            decoration: const InputDecoration(labelText: 'New Status'),
            items: LeadStatus.values
                .map((s) => DropdownMenuItem(
                      value: s.apiValue,
                      child: Text(s.label),
                    ))
                .toList(),
            onChanged: (v) => setS(() => newStatus = v),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: newStatus == null ? null : () => Navigator.pop(ctx),
            child: const Text('Apply'),
          ),
        ],
      ),
    );

    if (newStatus == null) return;
    if (!context.mounted) return;

    String? lostReason;
    if (newStatus == 'lost') {
      final result = await LostReasonDialog.show(context);
      if (result == null) return;
      lostReason = result.reason;
    }

    if (!context.mounted) return;
    await ref
        .read(leadListProvider.notifier)
        .bulkStatus(newStatus!, lostReason: lostReason);
    if (!context.mounted) return;
    AppSnackbar.success(context, 'Status updated');
  }

  Future<void> _bulkDelete(
    BuildContext context,
    LeadListNotifier notifier,
  ) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Selected Leads',
      message: 'Are you sure? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    if (!context.mounted) return;
    await notifier.bulkDelete();
    if (!context.mounted) return;
    AppSnackbar.success(context, 'Leads deleted');
  }
}
