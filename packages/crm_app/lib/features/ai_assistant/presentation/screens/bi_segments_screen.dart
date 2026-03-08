import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/bi_repository.dart';

final _segmentsProvider = FutureProvider.autoDispose.family<PaginatedResponse<CustomerSegmentModel>, String?>((ref, segment) async {
  return ref.watch(biRepositoryProvider).getSegments(segment: segment);
});

class BiSegmentsScreen extends ConsumerStatefulWidget {
  const BiSegmentsScreen({super.key});

  @override
  ConsumerState<BiSegmentsScreen> createState() => _BiSegmentsScreenState();
}

class _BiSegmentsScreenState extends ConsumerState<BiSegmentsScreen> {
  String? _segment;
  bool _calculating = false;

  Future<void> _recalculate() async {
    setState(() => _calculating = true);
    try {
      final result = await ref.read(biRepositoryProvider).calculateSegments();
      ref.invalidate(_segmentsProvider);
      if (mounted) AppSnackbar.success(context, 'Segmented ${result['segmented']} customers');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _calculating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final segmentsAsync = ref.watch(_segmentsProvider(_segment));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customer Segments'),
        actions: [
          TextButton.icon(
            onPressed: _calculating ? null : _recalculate,
            icon: _calculating
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.auto_fix_high),
            label: const Text('Recalculate'),
          ),
        ],
      ),
      body: Column(
        children: [
          AppFilterBar(
            filters: const ['All', 'VIP', 'High Potential', 'Churn Risk', 'Seasonal', 'Dormant', 'New'],
            selectedFilter: _segment == null ? 'All' : _segment == 'high_potential' ? 'High Potential' : _segment == 'churn_risk' ? 'Churn Risk' : '${_segment![0].toUpperCase()}${_segment!.substring(1)}',
            onFilterChanged: (v) => setState(() => _segment = v == 'All' ? null : v == 'High Potential' ? 'high_potential' : v == 'Churn Risk' ? 'churn_risk' : (v as String?)?.toLowerCase()),
          ),
          Expanded(
            child: segmentsAsync.when(
              data: (result) {
                final segments = result.data;
                if (segments.isEmpty) {
                  return Center(child: Text('No segments. Click Recalculate to start.', style: theme.textTheme.bodyMedium));
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: segments.length,
                  itemBuilder: (_, i) {
                    final s = segments[i];
                    final segColor = _segmentColor(s.segment);

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: segColor.withValues(alpha: 0.12),
                          child: Icon(_segmentIcon(s.segment), color: segColor, size: 20),
                        ),
                        title: Text(s.contactName ?? s.contactEmail ?? s.contactId, maxLines: 1),
                        subtitle: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: segColor.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(s.segment.replaceAll('_', ' ').toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: segColor)),
                            ),
                            if (s.lifetimeValue != null && s.lifetimeValue! > 0) ...[
                              const SizedBox(width: 6),
                              Text('\u20B9${s.lifetimeValue!.toStringAsFixed(0)}', style: theme.textTheme.labelSmall),
                            ],
                            if (s.churnRisk != null) ...[
                              const SizedBox(width: 6),
                              Text('Churn: ${(s.churnRisk! * 100).toStringAsFixed(0)}%', style: TextStyle(fontSize: 10, color: s.churnRisk! > 0.5 ? Colors.red : Colors.grey)),
                            ],
                          ],
                        ),
                        trailing: s.preferredChannel != null
                            ? Icon(_channelIcon(s.preferredChannel!), size: 18, color: Colors.grey)
                            : null,
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }

  Color _segmentColor(String segment) => switch (segment) {
    'vip' => Colors.amber,
    'high_potential' => Colors.green,
    'churn_risk' => Colors.red,
    'seasonal' => Colors.blue,
    'dormant' => Colors.grey,
    'new' => Colors.teal,
    _ => Colors.grey,
  };

  IconData _segmentIcon(String segment) => switch (segment) {
    'vip' => Icons.star,
    'high_potential' => Icons.trending_up,
    'churn_risk' => Icons.warning,
    'seasonal' => Icons.calendar_today,
    'dormant' => Icons.hotel,
    'new' => Icons.fiber_new,
    _ => Icons.person,
  };

  IconData _channelIcon(String channel) => switch (channel) {
    'whatsapp' => Icons.chat,
    'email' => Icons.email,
    'call' => Icons.phone,
    _ => Icons.message,
  };
}
