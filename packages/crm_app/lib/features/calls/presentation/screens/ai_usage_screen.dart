import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

// ── Provider ──────────────────────────────────────────────

final _periodProvider = StateProvider.autoDispose<String>((ref) => '30d');

final _usageProvider =
    FutureProvider.autoDispose<AiUsageSummary>((ref) async {
  final repo = ref.read(voipRepositoryProvider);
  final period = ref.watch(_periodProvider);
  return repo.getAiUsageSummary(period: period);
});

// ── Screen ────────────────────────────────────────────────

class AiUsageScreen extends ConsumerWidget {
  const AiUsageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final asyncUsage = ref.watch(_usageProvider);
    final period = ref.watch(_periodProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Usage')),
      body: asyncUsage.when(
        loading: () => const AppLoading(),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (usage) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Period selector
              Row(
                children: ['7d', '30d', '90d'].map((p) {
                  final selected = p == period;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(p == '7d'
                          ? '7 Days'
                          : p == '30d'
                              ? '30 Days'
                              : '90 Days'),
                      selected: selected,
                      onSelected: (_) =>
                          ref.read(_periodProvider.notifier).state = p,
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),

              // Summary stats
              Row(
                children: [
                  Expanded(
                    child: AppStatCard(
                      title: 'Total Cost',
                      value: '\$${usage.totalCost.toStringAsFixed(4)}',
                      icon: Icons.attach_money,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppStatCard(
                      title: 'Total Requests',
                      value: usage.totalRequests.toString(),
                      icon: Icons.api,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Breakdown table
              AppSectionCard(
                title: 'Usage Breakdown',
                child: usage.breakdown.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: Text('No usage data')),
                      )
                    : Column(
                        children: usage.breakdown.map((b) {
                          return Container(
                            padding: const EdgeInsets.symmetric(
                                vertical: 10, horizontal: 4),
                            decoration: BoxDecoration(
                              border: Border(
                                bottom: BorderSide(
                                    color: theme
                                        .colorScheme.outlineVariant
                                        .withValues(alpha: 0.3)),
                              ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        b.taskType,
                                        style: theme.textTheme.titleSmall,
                                      ),
                                      Text(
                                        b.modelName,
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(
                                                color: theme
                                                    .colorScheme.outline),
                                      ),
                                    ],
                                  ),
                                ),
                                Expanded(
                                  flex: 2,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        '${b.requestCount} req',
                                        style: theme.textTheme.bodyMedium,
                                      ),
                                      if (b.avgDurationMs != null)
                                        Text(
                                          '${b.avgDurationMs}ms avg',
                                          style: theme.textTheme.bodySmall
                                              ?.copyWith(
                                                  color: theme
                                                      .colorScheme.outline),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                SizedBox(
                                  width: 70,
                                  child: Text(
                                    '\$${b.totalCost.toStringAsFixed(4)}',
                                    textAlign: TextAlign.right,
                                    style: theme.textTheme.bodyMedium
                                        ?.copyWith(
                                            fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
