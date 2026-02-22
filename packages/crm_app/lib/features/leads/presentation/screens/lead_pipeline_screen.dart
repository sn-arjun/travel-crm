import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../data/lead_provider.dart';
import '../widgets/kanban_board.dart';
import '../widgets/lead_filter_bar.dart';
import '../widgets/lead_bulk_actions.dart';
import 'lead_list_screen.dart';

class LeadPipelineScreen extends ConsumerStatefulWidget {
  const LeadPipelineScreen({super.key});

  @override
  ConsumerState<LeadPipelineScreen> createState() => _LeadPipelineScreenState();
}

class _LeadPipelineScreenState extends ConsumerState<LeadPipelineScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(pipelineProvider.notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final listState = ref.watch(leadListProvider);
    final pipelineState = ref.watch(pipelineProvider);
    final isListView = listState.view == 'list';

    return Column(
      children: [
        // ── Top Bar ──────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppTheme.spacingMd,
            AppTheme.spacingMd,
            AppTheme.spacingMd,
            0,
          ),
          child: Row(
            children: [
              // View toggle
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'pipeline',
                    icon: Icon(Icons.view_kanban_outlined, size: 18),
                    label: Text('Pipeline'),
                  ),
                  ButtonSegment(
                    value: 'list',
                    icon: Icon(Icons.view_list_outlined, size: 18),
                    label: Text('List'),
                  ),
                ],
                selected: {listState.view},
                onSelectionChanged: (val) {
                  ref.read(leadListProvider.notifier).setView(val.first);
                  if (val.first == 'list') {
                    ref.read(leadListProvider.notifier).loadLeads(refresh: true);
                  } else {
                    ref.read(pipelineProvider.notifier).load();
                  }
                },
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: () => context.push('/leads/new'),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New Lead'),
              ),
            ],
          ),
        ),

        // ── Filter Bar ───────────────────────────────────────
        const LeadFilterBar(),

        // ── Bulk Actions ─────────────────────────────────────
        if (listState.selectedIds.isNotEmpty) const LeadBulkActions(),

        // ── Content ──────────────────────────────────────────
        Expanded(
          child: isListView
              ? const LeadListScreen(embedded: true)
              : KanbanBoard(pipelineState: pipelineState),
        ),
      ],
    );
  }
}
