import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../data/lead_provider.dart';
import '../../data/lead_state.dart';
import 'lead_filter_panel.dart';

/// A horizontally scrollable row of active filter chips with a "Filters" button.
///
/// Each active filter shows its value with an ✕ to clear it individually.
/// The "Filters" button opens [LeadFilterPanel] as a modal bottom-sheet.
class LeadFilterBar extends ConsumerWidget {
  const LeadFilterBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(leadListProvider);
    final notifier = ref.read(leadListProvider.notifier);

    if (!state.hasActiveFilters) {
      return _FiltersButton(state: state);
    }

    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spacingMd,
          vertical: 4,
        ),
        children: [
          _FiltersButton(state: state),
          const SizedBox(width: AppTheme.spacingXs),
          if (state.search.isNotEmpty)
            _ActiveChip(
              label: 'Search: "${state.search}"',
              onDelete: () => notifier.setSearch(''),
            ),
          if (state.statusFilter != null)
            _ActiveChip(
              label: 'Status: ${state.statusFilter}',
              onDelete: () => notifier.setFilter(status: null),
            ),
          if (state.priorityFilter != null)
            _ActiveChip(
              label: 'Priority: ${state.priorityFilter}',
              onDelete: () => notifier.setFilter(priority: null),
            ),
          if (state.sourceFilter != null)
            _ActiveChip(
              label: 'Source: ${state.sourceFilter}',
              onDelete: () => notifier.setFilter(source: null),
            ),
          if (state.tripTypeFilter != null)
            _ActiveChip(
              label: 'Type: ${state.tripTypeFilter}',
              onDelete: () => notifier.setFilter(tripType: null),
            ),
          if (state.assignedToFilter != null)
            _ActiveChip(
              label: 'Assignee set',
              onDelete: () => notifier.setFilter(assignedTo: null),
            ),
          if (state.travelDateFrom != null || state.travelDateTo != null)
            _ActiveChip(
              label: 'Date range set',
              onDelete: () => notifier.setFilter(
                travelDateFrom: null,
                travelDateTo: null,
              ),
            ),
          if (state.budgetMin != null || state.budgetMax != null)
            _ActiveChip(
              label: 'Budget range set',
              onDelete: () => notifier.setFilter(
                budgetMin: null,
                budgetMax: null,
              ),
            ),
          const SizedBox(width: AppTheme.spacingXs),
          ActionChip(
            label: const Text('Clear all'),
            avatar: const Icon(Icons.clear_all, size: 16),
            onPressed: notifier.clearFilters,
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }
}

class _FiltersButton extends StatelessWidget {
  final LeadListState state;
  const _FiltersButton({required this.state});

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: const Icon(Icons.tune, size: 16),
      label: const Text('Filters'),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => const LeadFilterPanel(),
      ),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}

class _ActiveChip extends StatelessWidget {
  final String label;
  final VoidCallback onDelete;

  const _ActiveChip({required this.label, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: AppTheme.spacingXs),
      child: Chip(
        label: Text(label),
        onDeleted: onDelete,
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        labelStyle: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }
}
