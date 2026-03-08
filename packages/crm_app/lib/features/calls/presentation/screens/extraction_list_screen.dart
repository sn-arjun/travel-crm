import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/voip_repository.dart';

// ── Providers ──────────────────────────────────────────────

final _statusFilter = StateProvider.autoDispose<String?>((ref) => null);
final _sentimentFilter = StateProvider.autoDispose<String?>((ref) => null);

final _extractionsProvider = FutureProvider.autoDispose<
    PaginatedResponse<AiExtractionModel>>((ref) async {
  final repo = ref.read(voipRepositoryProvider);
  final status = ref.watch(_statusFilter);
  final sentiment = ref.watch(_sentimentFilter);
  return repo.getExtractions(status: status, sentiment: sentiment);
});

final _pendingCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getExtractionsPendingCount();
});

// ── Screen ────────────────────────────────────────────────

class ExtractionListScreen extends ConsumerWidget {
  const ExtractionListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final asyncExtractions = ref.watch(_extractionsProvider);
    final asyncPending = ref.watch(_pendingCountProvider);
    final selectedStatus = ref.watch(_statusFilter);

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Extractions'),
        actions: [
          asyncPending.when(
            data: (count) => count > 0
                ? Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: Chip(
                      label: Text('$count pending'),
                      backgroundColor:
                          theme.colorScheme.primaryContainer,
                    ),
                  )
                : const SizedBox.shrink(),
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: Column(
        children: [
          AppFilterBar(
            filters: [
              FilterItem(label: 'All', value: null),
              FilterItem(label: 'Pending', value: 'pending'),
              FilterItem(label: 'Confirmed', value: 'confirmed'),
              FilterItem(label: 'Rejected', value: 'rejected'),
            ],
            selectedValue: selectedStatus,
            onFilterChanged: (v) =>
                ref.read(_statusFilter.notifier).state = v,
          ),
          Expanded(
            child: asyncExtractions.when(
              loading: () => const AppLoading(),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (result) => result.data.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_awesome_outlined,
                              size: 64,
                              color: theme.colorScheme.outline),
                          const SizedBox(height: 16),
                          Text('No extractions found',
                              style: theme.textTheme.bodyLarge),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(_extractionsProvider);
                        ref.invalidate(_pendingCountProvider);
                      },
                      child: ListView.builder(
                        itemCount: result.data.length,
                        padding: const EdgeInsets.all(16),
                        itemBuilder: (ctx, i) => _ExtractionCard(
                          extraction: result.data[i],
                          onTap: () => context.push(
                              '/calls/extractions/${result.data[i].id}'),
                        ),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExtractionCard extends StatelessWidget {
  final AiExtractionModel extraction;
  final VoidCallback onTap;

  const _ExtractionCard({required this.extraction, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final statusColor = switch (extraction.status) {
      'pending' => Colors.orange,
      'confirmed' => Colors.green,
      'rejected' => Colors.red,
      _ => Colors.grey,
    };

    final sentimentIcon = switch (extraction.sentiment) {
      'positive' => Icons.sentiment_satisfied,
      'negative' => Icons.sentiment_dissatisfied,
      'urgent' => Icons.warning_amber,
      _ => Icons.sentiment_neutral,
    };

    final sentimentColor = switch (extraction.sentiment) {
      'positive' => Colors.green,
      'negative' => Colors.red,
      'urgent' => Colors.deepOrange,
      _ => Colors.grey,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Icon(sentimentIcon, color: sentimentColor, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      extraction.destination ?? 'No destination',
                      style: theme.textTheme.titleSmall,
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      extraction.status.toUpperCase(),
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: statusColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Contact / number
              if (extraction.contactName != null ||
                  extraction.fromNumber != null)
                Row(
                  children: [
                    const Icon(Icons.person_outline, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      extraction.contactName ?? extraction.fromNumber ?? '',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(width: 12),
                    if (extraction.direction != null) ...[
                      Icon(
                        extraction.direction == 'inbound'
                            ? Icons.call_received
                            : Icons.call_made,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Text(extraction.direction!,
                          style: theme.textTheme.bodySmall),
                    ],
                  ],
                ),
              const SizedBox(height: 6),

              // Key info chips
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  if (extraction.paxCount != null)
                    _infoChip(
                        '${extraction.paxCount} pax', Icons.people_outline),
                  if (extraction.budget != null)
                    _infoChip(
                        '${extraction.budgetCurrency ?? '\$'}${extraction.budget!.toStringAsFixed(0)}',
                        Icons.attach_money),
                  if (extraction.tripType != null)
                    _infoChip(extraction.tripType!, Icons.flight),
                  if (extraction.dealLikelihood != null)
                    _infoChip(
                        '${(extraction.dealLikelihood! * 100).toStringAsFixed(0)}% likely',
                        Icons.trending_up),
                ],
              ),

              // Summary
              if (extraction.summary.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  extraction.summary.first,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
              ],

              // Confidence
              if (extraction.overallConfidence != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('Confidence: ',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(fontWeight: FontWeight.w500)),
                    Expanded(
                      child: LinearProgressIndicator(
                        value: extraction.overallConfidence!,
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                        color: _confidenceColor(extraction.overallConfidence!),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${(extraction.overallConfidence! * 100).toStringAsFixed(0)}%',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoChip(String label, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12),
          const SizedBox(width: 3),
          Text(label, style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }

  Color _confidenceColor(double v) {
    if (v >= 0.8) return Colors.green;
    if (v >= 0.5) return Colors.orange;
    return Colors.red;
  }
}
