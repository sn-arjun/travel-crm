import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _trendingProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  return ref.watch(biRepositoryProvider).getTrendingDestinations();
});

final _leadRoiProvider = FutureProvider.autoDispose<List<LeadSourceRoi>>((ref) async {
  return ref.watch(biRepositoryProvider).getLeadSourceRoi();
});

class BiDestinationsScreen extends ConsumerWidget {
  const BiDestinationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final trendingAsync = ref.watch(_trendingProvider);
    final roiAsync = ref.watch(_leadRoiProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Destinations & Lead ROI')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Trending destinations
            trendingAsync.when(
              data: (data) {
                final trending = (data['trending'] as List?) ?? [];
                return AppSectionCard(
                  title: 'Trending Destinations (30d)',
                  child: Column(
                    children: trending.asMap().entries.map((entry) {
                      final i = entry.key;
                      final d = entry.value as Map<String, dynamic>;
                      final growth = d['growth']?.toString() ?? '0';
                      final isNew = growth == 'new';
                      final isUp = !isNew && double.tryParse(growth) != null && double.parse(growth) > 0;

                      return ListTile(
                        leading: CircleAvatar(
                          radius: 14,
                          backgroundColor: isNew ? Colors.green.withValues(alpha: 0.12) : isUp ? Colors.blue.withValues(alpha: 0.12) : Colors.grey.withValues(alpha: 0.12),
                          child: Text('${i + 1}', style: TextStyle(fontSize: 11, color: isNew ? Colors.green : isUp ? Colors.blue : Colors.grey)),
                        ),
                        title: Text(d['destination']?.toString() ?? 'Unknown'),
                        subtitle: Text('${d['currentCount']} leads this month', style: theme.textTheme.labelSmall),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: isNew ? Colors.green.withValues(alpha: 0.1) : isUp ? Colors.blue.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            isNew ? 'NEW' : '${isUp ? '+' : ''}$growth%',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isNew ? Colors.green : isUp ? Colors.blue : Colors.red),
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
            const SizedBox(height: 16),

            // Lead Source ROI
            roiAsync.when(
              data: (sources) {
                if (sources.isEmpty) return const SizedBox.shrink();
                return AppSectionCard(
                  title: 'Lead Source ROI',
                  child: Column(
                    children: sources.map((s) {
                      return ListTile(
                        title: Text(s.source),
                        subtitle: Row(
                          children: [
                            Text('${s.totalLeads} leads', style: theme.textTheme.labelSmall),
                            const SizedBox(width: 8),
                            Text('${s.conversionRate}% conv', style: TextStyle(fontSize: 11, color: double.parse(s.conversionRate) > 20 ? Colors.green : Colors.grey)),
                            const SizedBox(width: 8),
                            Text('\u20B9${s.totalRevenue.toStringAsFixed(0)}', style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold)),
                          ],
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('${s.wonLeads}/${s.totalLeads}', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                            Text('won', style: theme.textTheme.labelSmall),
                          ],
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
}
