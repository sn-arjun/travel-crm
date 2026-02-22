import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/lead_provider.dart';
import 'priority_badge.dart';

class PrioritySelector extends ConsumerWidget {
  final String leadId;
  final String? currentPriority;

  const PrioritySelector({
    super.key,
    required this.leadId,
    this.currentPriority,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String?>(
      initialValue: currentPriority,
      onSelected: (priority) async {
        await ref.read(leadRepositoryProvider).updateLead(
              leadId,
              {'priority': priority},
            );
        ref.read(leadDetailProvider(leadId).notifier).load();
      },
      itemBuilder: (_) => [
        PopupMenuItem<String?>(
          value: null,
          child: Row(
            children: [
              if (currentPriority == null)
                const Icon(Icons.check, size: 16)
              else
                const SizedBox(width: 16),
              const SizedBox(width: 8),
              const Text('None'),
            ],
          ),
        ),
        ...['hot', 'warm', 'cold'].map((p) => PopupMenuItem<String>(
              value: p,
              child: Row(
                children: [
                  if (currentPriority == p)
                    const Icon(Icons.check, size: 16)
                  else
                    const SizedBox(width: 16),
                  const SizedBox(width: 8),
                  PriorityBadge(priority: p),
                ],
              ),
            )),
      ],
      child: currentPriority != null
          ? PriorityBadge(priority: currentPriority!)
          : const Icon(Icons.flag_outlined, size: 18, color: Colors.grey),
    );
  }
}
