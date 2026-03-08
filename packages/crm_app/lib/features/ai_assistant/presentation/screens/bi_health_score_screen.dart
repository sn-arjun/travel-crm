import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _healthProvider = FutureProvider.autoDispose<BusinessHealthScoreModel?>((ref) async {
  return ref.watch(biRepositoryProvider).getHealthScore();
});

class BiHealthScoreScreen extends ConsumerStatefulWidget {
  const BiHealthScoreScreen({super.key});

  @override
  ConsumerState<BiHealthScoreScreen> createState() => _BiHealthScoreScreenState();
}

class _BiHealthScoreScreenState extends ConsumerState<BiHealthScoreScreen> {
  bool _calculating = false;

  Future<void> _calculate() async {
    setState(() => _calculating = true);
    try {
      await ref.read(biRepositoryProvider).calculateHealthScore();
      ref.invalidate(_healthProvider);
      if (mounted) AppSnackbar.success(context, 'Health score calculated');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _calculating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final healthAsync = ref.watch(_healthProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Health'),
        actions: [
          TextButton.icon(
            onPressed: _calculating ? null : _calculate,
            icon: _calculating
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.refresh),
            label: const Text('Recalculate'),
          ),
        ],
      ),
      body: healthAsync.when(
        data: (health) {
          if (health == null) {
            return Center(
              child: ElevatedButton.icon(
                onPressed: _calculating ? null : _calculate,
                icon: const Icon(Icons.calculate),
                label: const Text('Calculate Health Score'),
              ),
            );
          }

          List<String> alerts = [];
          try {
            if (health.alerts != null) alerts = (jsonDecode(health.alerts!) as List).cast<String>();
          } catch (_) {}

          List<String> recommendations = [];
          try {
            if (health.recommendations != null) recommendations = (jsonDecode(health.recommendations!) as List).cast<String>();
          } catch (_) {}

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // Overall score
                Center(
                  child: SizedBox(
                    width: 120,
                    height: 120,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        CircularProgressIndicator(
                          value: health.overallScore / 100,
                          strokeWidth: 12,
                          backgroundColor: Colors.grey.withValues(alpha: 0.2),
                          color: _scoreColor(health.overallScore),
                        ),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('${health.overallScore}', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: _scoreColor(health.overallScore))),
                            if (health.scoreChange != null)
                              Text(
                                '${health.scoreChange! > 0 ? '+' : ''}${health.scoreChange}',
                                style: TextStyle(fontSize: 12, color: health.scoreChange! >= 0 ? Colors.green : Colors.red),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Dimension scores
                AppSectionCard(
                  title: 'Score Breakdown',
                  child: Column(
                    children: [
                      _dimensionRow('Revenue', health.revenueScore ?? 0, Icons.attach_money, theme),
                      _dimensionRow('Pipeline', health.pipelineScore ?? 0, Icons.filter_list, theme),
                      _dimensionRow('Customer', health.customerScore ?? 0, Icons.people, theme),
                      _dimensionRow('Team', health.teamScore ?? 0, Icons.group, theme),
                      _dimensionRow('Operations', health.operationsScore ?? 0, Icons.settings, theme),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Alerts
                if (alerts.isNotEmpty)
                  AppSectionCard(
                    title: 'Alerts',
                    child: Column(
                      children: alerts.map((a) => ListTile(
                        leading: const Icon(Icons.warning_amber, color: Colors.orange, size: 20),
                        title: Text(a, style: theme.textTheme.bodySmall),
                        dense: true,
                      )).toList(),
                    ),
                  ),
                const SizedBox(height: 12),

                // Recommendations
                if (recommendations.isNotEmpty)
                  AppSectionCard(
                    title: 'Recommendations',
                    child: Column(
                      children: recommendations.map((r) => ListTile(
                        leading: const Icon(Icons.lightbulb_outline, color: Colors.blue, size: 20),
                        title: Text(r, style: theme.textTheme.bodySmall),
                        dense: true,
                      )).toList(),
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

  Widget _dimensionRow(String label, int score, IconData icon, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: _scoreColor(score)),
          const SizedBox(width: 8),
          SizedBox(width: 80, child: Text(label, style: theme.textTheme.bodySmall)),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: score / 100,
                backgroundColor: Colors.grey.withValues(alpha: 0.15),
                color: _scoreColor(score),
                minHeight: 12,
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 30, child: Text('$score', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.right)),
        ],
      ),
    );
  }

  Color _scoreColor(int score) {
    if (score >= 75) return Colors.green;
    if (score >= 50) return Colors.orange;
    return Colors.red;
  }
}
