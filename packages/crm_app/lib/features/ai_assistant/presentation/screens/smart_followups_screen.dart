import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/ai_intelligence_repository.dart';

final _followupsProvider = FutureProvider.autoDispose.family<List<AiFollowUpSuggestionModel>, String>((ref, status) async {
  return ref.watch(aiIntelligenceRepositoryProvider).getSmartFollowups(status: status);
});

class SmartFollowupsScreen extends ConsumerStatefulWidget {
  const SmartFollowupsScreen({super.key});

  @override
  ConsumerState<SmartFollowupsScreen> createState() => _SmartFollowupsScreenState();
}

class _SmartFollowupsScreenState extends ConsumerState<SmartFollowupsScreen> {
  String _status = 'pending';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final followupsAsync = ref.watch(_followupsProvider(_status));

    return Scaffold(
      appBar: AppBar(title: const Text('Smart Follow-ups')),
      body: Column(
        children: [
          AppFilterBar(
            filters: const ['Pending', 'Sent', 'Dismissed'],
            selectedFilter: _status[0].toUpperCase() + _status.substring(1),
            onFilterChanged: (v) => setState(() => _status = (v as String?)?.toLowerCase() ?? 'pending'),
          ),
          Expanded(
            child: followupsAsync.when(
              data: (items) => items.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_awesome, size: 48, color: theme.colorScheme.outline),
                          const SizedBox(height: 8),
                          Text('No $_status follow-ups', style: theme.textTheme.bodyMedium),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: items.length,
                      itemBuilder: (_, i) => _FollowupCard(
                        item: items[i],
                        onSend: () => _send(items[i].id),
                        onDismiss: () => _dismiss(items[i].id),
                      ),
                    ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _send(String id) async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).sendFollowup(id);
      ref.invalidate(_followupsProvider);
      if (mounted) AppSnackbar.success(context, 'Follow-up sent');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _dismiss(String id) async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).dismissFollowup(id);
      ref.invalidate(_followupsProvider);
      if (mounted) AppSnackbar.success(context, 'Dismissed');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }
}

class _FollowupCard extends StatelessWidget {
  final AiFollowUpSuggestionModel item;
  final VoidCallback onSend;
  final VoidCallback onDismiss;

  const _FollowupCard({required this.item, required this.onSend, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final channelIcon = switch (item.suggestedChannel) {
      'whatsapp' => Icons.chat,
      'email' => Icons.email,
      'call' => Icons.phone,
      _ => Icons.message,
    };
    final channelColor = switch (item.suggestedChannel) {
      'whatsapp' => Colors.green,
      'email' => Colors.blue,
      'call' => Colors.orange,
      _ => Colors.grey,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: channelColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(channelIcon, color: channelColor, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${item.suggestedChannel?.toUpperCase() ?? 'CONTACT'} Follow-up',
                        style: theme.textTheme.titleSmall,
                      ),
                      if (item.channelReasoning != null)
                        Text(item.channelReasoning!, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline)),
                    ],
                  ),
                ),
                if (item.escalationLevel > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      item.escalationLevel == 2 ? 'ESCALATE' : 'URGENT',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.red),
                    ),
                  ),
                if (item.isWinBack)
                  Container(
                    margin: const EdgeInsets.only(left: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.purple.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('WIN-BACK', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.purple)),
                  ),
              ],
            ),
            const SizedBox(height: 10),

            // Timing
            if (item.timingReasoning != null) ...[
              Row(
                children: [
                  const Icon(Icons.schedule, size: 14),
                  const SizedBox(width: 4),
                  Expanded(child: Text(item.timingReasoning!, style: theme.textTheme.bodySmall)),
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Message content
            if (item.messageContent != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(item.messageContent!, style: theme.textTheme.bodySmall?.copyWith(height: 1.4)),
              ),
              const SizedBox(height: 10),
            ],

            // Confidence
            if (item.confidenceScore != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const Text('Confidence: ', style: TextStyle(fontSize: 11)),
                    Expanded(
                      child: LinearProgressIndicator(
                        value: item.confidenceScore!,
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text('${(item.confidenceScore! * 100).toInt()}%', style: const TextStyle(fontSize: 11)),
                  ],
                ),
              ),

            // Actions
            if (item.status == 'pending')
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: onSend,
                    icon: const Icon(Icons.send, size: 16),
                    label: const Text('Send'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
