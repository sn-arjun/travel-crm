import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// Represents a single filter option.
class FilterItem<T> {
  final String label;
  final T value;

  const FilterItem({required this.label, required this.value});
}

/// A horizontally scrollable row of filter chips.
///
/// Supports two usage patterns:
/// 1. Typed: pass `filters` as `List<FilterItem<T>>` with `selectedValue` + `onFilterChanged`
/// 2. Record: pass `filters` as `List<(String, String?)>` with `selectedFilter` + `onFilterChanged`
///    and optionally `onClear`.
///
/// ```dart
/// // Typed usage:
/// AppFilterBar<String>(
///   filters: [
///     FilterItem(label: 'Hot', value: 'hot'),
///   ],
///   selectedValue: _selectedPriority,
///   onFilterChanged: (value) => setState(() => _selectedPriority = value),
/// )
///
/// // Record usage:
/// AppFilterBar(
///   filters: [('Draft', 'draft'), ('Sent', 'sent')],
///   selectedFilter: state.statusFilter,
///   onFilterChanged: (value) => notifier.setStatusFilter(value as String?),
///   onClear: () => notifier.clearFilters(),
/// )
/// ```
class AppFilterBar<T> extends StatelessWidget {
  final List<Object> filters;

  /// The currently selected value (typed). Null means "All" is active.
  final T? selectedValue;

  /// The currently selected filter value (string alias). Null means "All" is active.
  final String? selectedFilter;

  /// Called when a filter chip is tapped. Passes null when "All" is selected.
  final ValueChanged<T?>? onFilterChanged;

  /// Optional callback when "All" chip is tapped (alternative to onFilterChanged with null).
  final VoidCallback? onClear;

  const AppFilterBar({
    super.key,
    required this.filters,
    this.selectedValue,
    this.selectedFilter,
    this.onFilterChanged,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    // Normalize filters to list of (label, value) pairs
    final normalized = filters.map((f) {
      if (f is FilterItem) return (f.label, f.value);
      if (f is (String, Object?)) return (f.$1, f.$2);
      return ('', null);
    }).toList();

    // Determine effective selected value
    final effectiveSelected = selectedValue ?? selectedFilter;

    return SizedBox(
      height: 48,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // "All" chip
            Padding(
              padding: const EdgeInsets.only(right: AppTheme.spacingSm),
              child: FilterChip(
                label: const Text('All'),
                selected: effectiveSelected == null,
                onSelected: (_) {
                  if (onClear != null) {
                    onClear!();
                  } else {
                    onFilterChanged?.call(null);
                  }
                },
              ),
            ),
            // Individual filter chips
            ...normalized.map((entry) {
              final label = entry.$1;
              final value = entry.$2;
              final isSelected = value == effectiveSelected;
              return Padding(
                padding: const EdgeInsets.only(right: AppTheme.spacingSm),
                child: FilterChip(
                  label: Text(label),
                  selected: isSelected,
                  onSelected: (_) {
                    if (isSelected) {
                      if (onClear != null) {
                        onClear!();
                      } else {
                        onFilterChanged?.call(null);
                      }
                    } else {
                      onFilterChanged?.call(value as T?);
                    }
                  },
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
