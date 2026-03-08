import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/bi_repository.dart';

final _briefingProvider = FutureProvider.autoDispose.family<AiBriefingModel, String>((ref, id) async {
  return ref.watch(biRepositoryProvider).getBriefing(id);
});

class BiBriefingDetailScreen extends ConsumerWidget {
  final String briefingId;
  const BiBriefingDetailScreen({super.key, required this.briefingId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final briefingAsync = ref.watch(_briefingProvider(briefingId));

    return Scaffold(
      appBar: AppBar(title: const Text('Briefing')),
      body: briefingAsync.when(
        data: (b) {
          List<dynamic> sections = [];
          try {
            sections = jsonDecode(b.content) as List;
          } catch (_) {}

          List<dynamic> highlights = [];
          try {
            if (b.highlights != null) highlights = jsonDecode(b.highlights!) as List;
          } catch (_) {}

          Map<String, dynamic> metrics = {};
          try {
            if (b.metrics != null) metrics = jsonDecode(b.metrics!) as Map<String, dynamic>;
          } catch (_) {}

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.title, style: theme.textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text('${b.briefingType.toUpperCase()} • ${b.period}', style: theme.textTheme.labelMedium),
                const SizedBox(height: 16),

                // Key metrics
                if (metrics.isNotEmpty)
                  AppSectionCard(
                    title: 'Key Metrics',
                    child: Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      children: metrics.entries.map((e) {
                        return Column(
                          children: [
                            Text('${e.value}', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                            Text(e.key.replaceAll('_', ' '), style: theme.textTheme.labelSmall),
                          ],
                        );
                      }).toList(),
                    ),
                  ),
                const SizedBox(height: 12),

                // Sections
                for (final section in sections) ...[
                  AppSectionCard(
                    title: section['heading']?.toString() ?? 'Section',
                    child: Text(section['body']?.toString() ?? '', style: theme.textTheme.bodyMedium),
                  ),
                  const SizedBox(height: 12),
                ],

                // Highlights
                if (highlights.isNotEmpty)
                  AppSectionCard(
                    title: 'Highlights',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: highlights.map((h) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.star, size: 16, color: Colors.amber),
                            const SizedBox(width: 6),
                            Expanded(child: Text(h.toString(), style: theme.textTheme.bodySmall)),
                          ],
                        ),
                      )).toList(),
                    ),
                  ),

                const SizedBox(height: 12),
                Text('Model: ${b.modelUsed ?? 'N/A'} • Cost: \$${b.costEstimate.toStringAsFixed(4)}',
                  style: theme.textTheme.labelSmall?.copyWith(color: Colors.grey),
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
}
