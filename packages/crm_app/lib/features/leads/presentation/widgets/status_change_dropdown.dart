import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../data/lead_provider.dart';
import 'lost_reason_dialog.dart';

class StatusChangeDropdown extends ConsumerWidget {
  final String leadId;
  final String currentStatus;

  const StatusChangeDropdown({
    super.key,
    required this.leadId,
    required this.currentStatus,
  });

  Future<void> _changeStatus(BuildContext context, WidgetRef ref, String newStatus) async {
    String? lostReason;
    String? lostNotes;

    if (newStatus == 'lost') {
      final result = await LostReasonDialog.show(context);
      if (result == null) return;
      lostReason = result.reason;
      lostNotes = result.notes;
    }

    await ref.read(leadDetailProvider(leadId).notifier).changeStatus(
          newStatus,
          lostReason: lostReason,
          lostReasonNotes: lostNotes,
        );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      initialValue: currentStatus,
      onSelected: (status) => _changeStatus(context, ref, status),
      itemBuilder: (_) => LeadStatus.values
          .map((s) => PopupMenuItem(
                value: s.apiValue,
                child: Row(
                  children: [
                    if (s.apiValue == currentStatus)
                      const Icon(Icons.check, size: 16)
                    else
                      const SizedBox(width: 16),
                    const SizedBox(width: 8),
                    Text(s.label),
                  ],
                ),
              ))
          .toList(),
      child: Chip(
        label: Text(
          LeadStatus.fromApiValue(currentStatus).label,
          style: const TextStyle(fontSize: 12),
        ),
        avatar: const Icon(Icons.arrow_drop_down, size: 16),
      ),
    );
  }
}
