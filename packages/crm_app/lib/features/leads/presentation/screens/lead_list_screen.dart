import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../data/lead_provider.dart';
import '../../data/lead_state.dart';
import '../widgets/lead_filter_bar.dart';
import '../widgets/lead_bulk_actions.dart';
import '../widgets/priority_badge.dart';

class LeadListScreen extends ConsumerStatefulWidget {
  /// When true, rendered inside LeadPipelineScreen (no standalone filter bar)
  final bool embedded;

  const LeadListScreen({super.key, this.embedded = false});

  @override
  ConsumerState<LeadListScreen> createState() => _LeadListScreenState();
}

class _LeadListScreenState extends ConsumerState<LeadListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(leadListProvider.notifier).loadLeads(refresh: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(leadListProvider);

    if (!widget.embedded) {
      return Column(
        children: [
          const LeadFilterBar(),
          if (state.selectedIds.isNotEmpty) const LeadBulkActions(),
          Expanded(child: _buildBody(context, state)),
        ],
      );
    }
    return _buildBody(context, state);
  }

  Widget _buildBody(BuildContext context, LeadListState state) {
    if (state.status == LeadListStatus.loading && state.leads.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.status == LeadListStatus.error && state.leads.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load leads',
        onRetry: () =>
            ref.read(leadListProvider.notifier).loadLeads(refresh: true),
      );
    }

    if (state.leads.isEmpty) {
      return AppEmptyState(
        icon: Icons.leaderboard_outlined,
        title: 'No leads found',
        subtitle: state.hasActiveFilters
            ? 'Try adjusting your filters'
            : 'Create your first lead to get started',
        actionLabel: state.hasActiveFilters ? 'Clear filters' : null,
        onAction: state.hasActiveFilters
            ? () => ref.read(leadListProvider.notifier).clearFilters()
            : null,
      );
    }

    // Map selected String IDs → indices for AppDataTable
    final selectedIndices = <int>{};
    for (var i = 0; i < state.leads.length; i++) {
      if (state.selectedIds.contains(state.leads[i].id)) {
        selectedIndices.add(i);
      }
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n is ScrollEndNotification &&
            n.metrics.extentAfter < 200 &&
            state.hasMore) {
          ref.read(leadListProvider.notifier).loadNextPage();
        }
        return false;
      },
      child: AppDataTable<LeadModel>(
        selectable: true,
        selectedIndices: selectedIndices,
        onSelectionChanged: (indices) {
          final newIds = indices.map((i) => state.leads[i].id).toSet();
          final notifier = ref.read(leadListProvider.notifier);
          notifier.clearSelection();
          for (final id in newIds) {
            notifier.toggleSelection(id);
          }
        },
        onRowTap: (i) => context.go('/leads/${state.leads[i].id}'),
        columns: [
          AppDataColumn(
            title: 'Title',
            field: 'title',
            sortable: true,
            cellBuilder: (v) => Text(
              '$v',
              style: const TextStyle(fontWeight: FontWeight.w500),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const AppDataColumn(title: 'Contact', field: 'contactName'),
          AppDataColumn(
            title: 'Destination',
            field: 'destinations',
            cellBuilder: (v) {
              final dests = (v as List<String>? ?? []).take(2).join(', ');
              return Text(
                dests.isEmpty ? '—' : dests,
                overflow: TextOverflow.ellipsis,
              );
            },
          ),
          AppDataColumn(
            title: 'Travel Date',
            field: 'travelDate',
            cellBuilder: (v) => Text(_formatDate('$v')),
          ),
          const AppDataColumn(title: 'Budget', field: 'budget'),
          AppDataColumn(
            title: 'Status',
            field: 'status',
            cellBuilder: (v) => _StatusChip(status: '$v'),
          ),
          AppDataColumn(
            title: 'Priority',
            field: 'priority',
            cellBuilder: (v) =>
                v != null ? PriorityBadge(priority: '$v') : const Text('—'),
          ),
          const AppDataColumn(title: 'Assigned To', field: 'assignedToName'),
        ],
        rows: state.leads,
        rowValueFor: (lead, field) => switch (field) {
          'title' => lead.title,
          'contactName' => lead.contactName ?? '—',
          'destinations' => lead.destinations,
          'travelDate' => lead.travelDate,
          'budget' => lead.budget != null
              ? '${lead.currency} ${lead.budget!.toStringAsFixed(0)}'
              : '—',
          'status' => lead.status,
          'priority' => lead.priority,
          'assignedToName' => lead.assignedToName ?? 'Unassigned',
          _ => null,
        },
        sortState: SortState(
          field: state.sortBy,
          ascending: state.sortOrder == 'asc',
        ),
        onSort: (s) => ref.read(leadListProvider.notifier).setSort(
              s.field,
              s.ascending ? 'asc' : 'desc',
            ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (color, label) = switch (status) {
      'new' => (Colors.blue, 'New'),
      'contacted' => (Colors.cyan, 'Contacted'),
      'requirement_gathered' => (Colors.indigo, 'Req. Gathered'),
      'proposal_sent' => (Colors.orange, 'Proposal Sent'),
      'negotiation' => (Colors.amber, 'Negotiation'),
      'booking_confirmed' => (Colors.green, 'Confirmed'),
      'completed' => (Colors.teal, 'Completed'),
      'lost' => (Colors.red, 'Lost'),
      _ => (Colors.grey, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
