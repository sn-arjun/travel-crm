import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _teamProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  return ref.watch(biRepositoryProvider).getTeamPerformance();
});

final _workloadProvider = FutureProvider.autoDispose<WorkloadAnalysis>((ref) async {
  return ref.watch(biRepositoryProvider).getWorkloadAnalysis();
});

class BiTeamScreen extends ConsumerWidget {
  const BiTeamScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final teamAsync = ref.watch(_teamProvider);
    final workloadAsync = ref.watch(_workloadProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Team Intelligence')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Workload alerts
            workloadAsync.when(
              data: (w) {
                if (w.alerts.isEmpty) return const SizedBox.shrink();
                return AppSectionCard(
                  title: 'Workload Alerts',
                  child: Column(
                    children: w.alerts.map((a) => ListTile(
                      leading: const Icon(Icons.warning_amber, color: Colors.orange, size: 20),
                      title: Text(a, style: theme.textTheme.bodySmall),
                      dense: true,
                    )).toList(),
                  ),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Team performance
            teamAsync.when(
              data: (data) {
                final rankings = (data['rankings'] as List?) ?? [];
                final insights = (data['insights'] as List?)?.cast<String>() ?? [];

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (rankings.isNotEmpty)
                      AppSectionCard(
                        title: 'Team Rankings',
                        child: Column(
                          children: rankings.asMap().entries.map((entry) {
                            final i = entry.key;
                            final r = entry.value as Map<String, dynamic>;
                            final score = r['score'] ?? 0;
                            return ListTile(
                              leading: CircleAvatar(
                                radius: 16,
                                backgroundColor: i == 0 ? Colors.amber : Colors.grey.withValues(alpha: 0.2),
                                child: Text('${i + 1}', style: TextStyle(fontSize: 12, color: i == 0 ? Colors.white : null)),
                              ),
                              title: Text(r['name']?.toString() ?? 'Unknown'),
                              subtitle: Row(
                                children: [
                                  SizedBox(
                                    width: 80,
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(3),
                                      child: LinearProgressIndicator(
                                        value: (score as num).toDouble() / 100,
                                        minHeight: 6,
                                        color: _scoreColor(score as int),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text('$score/100', style: theme.textTheme.labelSmall),
                                ],
                              ),
                              dense: true,
                            );
                          }).toList(),
                        ),
                      ),
                    const SizedBox(height: 12),

                    if (insights.isNotEmpty)
                      AppSectionCard(
                        title: 'Insights',
                        child: Column(
                          children: insights.map((i) => ListTile(
                            leading: const Icon(Icons.insights, size: 18, color: Colors.blue),
                            title: Text(i, style: theme.textTheme.bodySmall),
                            dense: true,
                          )).toList(),
                        ),
                      ),
                  ],
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Error: $e'),
            ),

            const SizedBox(height: 12),

            // Workload distribution
            workloadAsync.when(
              data: (w) {
                final users = w.users ?? [];
                if (users.isEmpty) return const SizedBox.shrink();
                return AppSectionCard(
                  title: 'Workload Distribution',
                  child: Column(
                    children: users.map((u) {
                      final leads = u['active_leads'] ?? 0;
                      final followups = u['pending_followups'] ?? 0;
                      final tasks = u['active_tasks'] ?? 0;
                      return ListTile(
                        title: Text(u['name']?.toString() ?? 'Unknown'),
                        subtitle: Text('$leads leads • $followups follow-ups • $tasks tasks', style: theme.textTheme.labelSmall),
                        trailing: SizedBox(
                          width: 60,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: LinearProgressIndicator(
                              value: w.avgLeadsPerUser > 0 ? (leads as num).toDouble() / (w.avgLeadsPerUser * 2) : 0,
                              minHeight: 8,
                              color: (leads as num) > w.avgLeadsPerUser * 1.5 ? Colors.red : Colors.green,
                            ),
                          ),
                        ),
                        dense: true,
                      );
                    }).toList(),
                  ),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Error: $e'),
            ),
          ],
        ),
      ),
    );
  }

  Color _scoreColor(int score) {
    if (score >= 75) return Colors.green;
    if (score >= 50) return Colors.orange;
    return Colors.red;
  }
}
