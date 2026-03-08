import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _usageProvider = FutureProvider.autoDispose.family<BiUsageSummary, String>((ref, period) async {
  return ref.watch(biRepositoryProvider).getUsage(period: period);
});

class BiUsageScreen extends ConsumerStatefulWidget {
  const BiUsageScreen({super.key});

  @override
  ConsumerState<BiUsageScreen> createState() => _BiUsageScreenState();
}

class _BiUsageScreenState extends ConsumerState<BiUsageScreen> {
  String _period = '30d';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final usageAsync = ref.watch(_usageProvider(_period));

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Usage & Costs'),
        actions: [
          DropdownButton<String>(
            value: _period,
            underline: const SizedBox.shrink(),
            items: const [
              DropdownMenuItem(value: '7d', child: Text('7 Days')),
              DropdownMenuItem(value: '30d', child: Text('30 Days')),
              DropdownMenuItem(value: '90d', child: Text('90 Days')),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _period = v);
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: usageAsync.when(
        data: (usage) {
          final summary = usage.summary ?? {};
          final calls = summary['calls'] ?? 0;
          final inputTokens = summary['input_tokens'] ?? 0;
          final outputTokens = summary['output_tokens'] ?? 0;
          final totalCost = summary['total_cost'] ?? 0.0;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top stats
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'API Calls',
                        value: '$calls',
                        icon: Icons.api,
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'Total Cost',
                        value: '\$${(totalCost as num).toDouble().toStringAsFixed(2)}',
                        icon: Icons.attach_money,
                        iconColor: Colors.green,
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'Input Tokens',
                        value: _formatTokens(inputTokens as int),
                        icon: Icons.input,
                        iconColor: Colors.blue,
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'Output Tokens',
                        value: _formatTokens(outputTokens as int),
                        icon: Icons.output,
                        iconColor: Colors.purple,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // By task type
                if (usage.byTask != null && usage.byTask!.isNotEmpty)
                  AppSectionCard(
                    title: 'Usage by Task',
                    child: Column(
                      children: usage.byTask!.map((t) {
                        return ListTile(
                          title: Text(t['task_type']?.toString().replaceAll('_', ' ') ?? 'Unknown'),
                          subtitle: Text('${t['calls']} calls • ${_formatTokens((t['tokens'] ?? 0) as int)} tokens', style: theme.textTheme.labelSmall),
                          trailing: Text('\$${((t['cost'] ?? 0) as num).toDouble().toStringAsFixed(4)}', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
                          dense: true,
                        );
                      }).toList(),
                    ),
                  ),
                const SizedBox(height: 12),

                // By model
                if (usage.byModel != null && usage.byModel!.isNotEmpty)
                  AppSectionCard(
                    title: 'Usage by Model',
                    child: Column(
                      children: usage.byModel!.map((m) {
                        return ListTile(
                          title: Text(m['model_name']?.toString() ?? 'Unknown'),
                          subtitle: Text('${m['calls']} calls', style: theme.textTheme.labelSmall),
                          trailing: Text('\$${((m['cost'] ?? 0) as num).toDouble().toStringAsFixed(4)}', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
                          dense: true,
                        );
                      }).toList(),
                    ),
                  ),
                const SizedBox(height: 12),

                // Daily usage
                if (usage.daily != null && usage.daily!.isNotEmpty)
                  AppSectionCard(
                    title: 'Daily Usage',
                    child: Column(
                      children: usage.daily!.map((d) {
                        final maxCost = usage.daily!.fold<double>(0, (max, item) {
                          final c = ((item['cost'] ?? 0) as num).toDouble();
                          return c > max ? c : max;
                        });
                        final cost = ((d['cost'] ?? 0) as num).toDouble();
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            children: [
                              SizedBox(width: 80, child: Text(d['day']?.toString().substring(5) ?? '', style: theme.textTheme.labelSmall)),
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(2),
                                  child: LinearProgressIndicator(
                                    value: maxCost > 0 ? cost / maxCost : 0,
                                    minHeight: 10,
                                    backgroundColor: Colors.grey.withValues(alpha: 0.1),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(width: 60, child: Text('\$${cost.toStringAsFixed(4)}', style: theme.textTheme.labelSmall, textAlign: TextAlign.right)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  String _formatTokens(int tokens) {
    if (tokens >= 1000000) return '${(tokens / 1000000).toStringAsFixed(1)}M';
    if (tokens >= 1000) return '${(tokens / 1000).toStringAsFixed(1)}K';
    return '$tokens';
  }
}
