import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/bi_repository.dart';

final _briefingsProvider = FutureProvider.autoDispose.family<PaginatedResponse<AiBriefingModel>, String?>((ref, type) async {
  return ref.watch(biRepositoryProvider).getBriefings(type: type);
});

class BiBriefingsScreen extends ConsumerStatefulWidget {
  const BiBriefingsScreen({super.key});

  @override
  ConsumerState<BiBriefingsScreen> createState() => _BiBriefingsScreenState();
}

class _BiBriefingsScreenState extends ConsumerState<BiBriefingsScreen> {
  String? _type;
  bool _generating = false;

  Future<void> _generate(String type) async {
    setState(() => _generating = true);
    try {
      await ref.read(biRepositoryProvider).generateBriefing(type);
      ref.invalidate(_briefingsProvider);
      if (mounted) AppSnackbar.success(context, '${type.substring(0, 1).toUpperCase()}${type.substring(1)} briefing generated');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final briefingsAsync = ref.watch(_briefingsProvider(_type));

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Briefings'),
        actions: [
          PopupMenuButton<String>(
            icon: _generating
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.add),
            onSelected: _generating ? null : _generate,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'daily', child: Text('Generate Daily')),
              PopupMenuItem(value: 'weekly', child: Text('Generate Weekly')),
              PopupMenuItem(value: 'monthly', child: Text('Generate Monthly')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SegmentedButton<String?>(
              segments: const [
                ButtonSegment(value: null, label: Text('All')),
                ButtonSegment(value: 'daily', label: Text('Daily')),
                ButtonSegment(value: 'weekly', label: Text('Weekly')),
                ButtonSegment(value: 'monthly', label: Text('Monthly')),
              ],
              selected: {_type},
              onSelectionChanged: (v) => setState(() => _type = v.first),
            ),
          ),
          Expanded(
            child: briefingsAsync.when(
              data: (result) {
                final briefings = result.data;
                if (briefings.isEmpty) {
                  return Center(child: Text('No briefings yet', style: theme.textTheme.bodyMedium));
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: briefings.length,
                  itemBuilder: (_, i) {
                    final b = briefings[i];
                    final typeIcon = switch (b.briefingType) {
                      'daily' => Icons.today,
                      'weekly' => Icons.view_week,
                      'monthly' => Icons.calendar_month,
                      _ => Icons.article,
                    };
                    final typeColor = switch (b.briefingType) {
                      'daily' => Colors.blue,
                      'weekly' => Colors.purple,
                      'monthly' => Colors.teal,
                      _ => Colors.grey,
                    };

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: typeColor.withValues(alpha: 0.12),
                          child: Icon(typeIcon, color: typeColor, size: 20),
                        ),
                        title: Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Row(
                          children: [
                            Chip(
                              label: Text(b.briefingType.toUpperCase()),
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              labelStyle: TextStyle(fontSize: 9, color: typeColor),
                            ),
                            const SizedBox(width: 6),
                            Text(b.period, style: theme.textTheme.labelSmall),
                            if (b.readAt == null) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.fiber_new, size: 16, color: Colors.red),
                            ],
                          ],
                        ),
                        trailing: Text(
                          b.createdAt?.substring(0, 10) ?? '',
                          style: theme.textTheme.labelSmall,
                        ),
                        onTap: () => context.push('/ai/bi/briefings/${b.id}'),
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
}
