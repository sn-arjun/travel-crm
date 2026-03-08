import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _revenuePulseProvider = FutureProvider.autoDispose<RevenuePulse>((ref) async {
  return ref.watch(biRepositoryProvider).getRevenuePulse();
});

final _healthScoreProvider = FutureProvider.autoDispose<BusinessHealthScoreModel?>((ref) async {
  return ref.watch(biRepositoryProvider).getHealthScore();
});

class BiDashboardScreen extends ConsumerWidget {
  const BiDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final pulseAsync = ref.watch(_revenuePulseProvider);
    final healthAsync = ref.watch(_healthScoreProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Business Intelligence')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Revenue Pulse
            pulseAsync.when(
              data: (pulse) => AppSectionCard(
                title: 'Revenue Pulse',
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'This Month',
                        value: '\u20B9${_formatAmount(pulse.currentMonthRevenue)}',
                        icon: Icons.trending_up,
                        trend: pulse.momChange,
                        trendLabel: 'vs last month',
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'Pipeline',
                        value: '\u20B9${_formatAmount(pulse.pipelineValue)}',
                        icon: Icons.filter_list,
                        iconColor: Colors.blue,
                      ),
                    ),
                    SizedBox(
                      width: 150,
                      child: AppStatCard(
                        title: 'Avg Deal',
                        value: '\u20B9${_formatAmount(pulse.avgDealSize)}',
                        icon: Icons.analytics,
                        iconColor: Colors.purple,
                      ),
                    ),
                  ],
                ),
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Error: $e'),
            ),
            const SizedBox(height: 16),

            // Health Score
            healthAsync.when(
              data: (health) {
                if (health == null) {
                  return AppSectionCard(
                    title: 'Business Health',
                    child: Center(
                      child: ElevatedButton.icon(
                        onPressed: () => context.push('/ai/bi/health-score'),
                        icon: const Icon(Icons.calculate),
                        label: const Text('Calculate Health Score'),
                      ),
                    ),
                  );
                }
                return AppSectionCard(
                  title: 'Business Health Score',
                  child: InkWell(
                    onTap: () => context.push('/ai/bi/health-score'),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 80,
                          height: 80,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              CircularProgressIndicator(
                                value: health.overallScore / 100,
                                strokeWidth: 8,
                                backgroundColor: Colors.grey.withValues(alpha: 0.2),
                                color: _scoreColor(health.overallScore),
                              ),
                              Text(
                                '${health.overallScore}',
                                style: theme.textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: _scoreColor(health.overallScore),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _scoreBar('Revenue', health.revenueScore ?? 0, theme),
                              _scoreBar('Pipeline', health.pipelineScore ?? 0, theme),
                              _scoreBar('Customer', health.customerScore ?? 0, theme),
                              _scoreBar('Team', health.teamScore ?? 0, theme),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Error: $e'),
            ),
            const SizedBox(height: 16),

            // Quick navigation
            AppSectionCard(
              title: 'Intelligence Modules',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _navChip(context, 'Briefings', Icons.article, '/ai/bi/briefings'),
                  _navChip(context, 'Team', Icons.group, '/ai/bi/team'),
                  _navChip(context, 'Segments', Icons.pie_chart, '/ai/bi/segments'),
                  _navChip(context, 'Destinations', Icons.flight, '/ai/bi/destinations'),
                  _navChip(context, 'Lead ROI', Icons.monetization_on, '/ai/bi/lead-roi'),
                  _navChip(context, 'AI Usage', Icons.token, '/ai/bi/usage'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _navChip(BuildContext context, String label, IconData icon, String route) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      onPressed: () => context.push(route),
    );
  }

  Widget _scoreBar(String label, int score, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(width: 70, child: Text(label, style: theme.textTheme.labelSmall)),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: score / 100,
                backgroundColor: Colors.grey.withValues(alpha: 0.15),
                color: _scoreColor(score),
                minHeight: 6,
              ),
            ),
          ),
          const SizedBox(width: 4),
          SizedBox(width: 24, child: Text('$score', style: theme.textTheme.labelSmall, textAlign: TextAlign.right)),
        ],
      ),
    );
  }

  Color _scoreColor(int score) {
    if (score >= 75) return Colors.green;
    if (score >= 50) return Colors.orange;
    return Colors.red;
  }

  String _formatAmount(double amount) {
    if (amount >= 100000) return '${(amount / 100000).toStringAsFixed(1)}L';
    if (amount >= 1000) return '${(amount / 1000).toStringAsFixed(1)}K';
    return amount.toStringAsFixed(0);
  }
}
