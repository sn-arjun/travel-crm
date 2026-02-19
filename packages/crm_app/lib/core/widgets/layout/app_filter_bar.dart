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
/// Includes an "All" chip that clears the active filter when tapped.
///
/// ```dart
/// AppFilterBar<String>(
///   filters: [
///     FilterItem(label: 'Hot', value: 'hot'),
///     FilterItem(label: 'Warm', value: 'warm'),
///     FilterItem(label: 'Cold', value: 'cold'),
///   ],
///   selectedValue: _selectedPriority,
///   onFilterChanged: (value) => setState(() => _selectedPriority = value),
/// )
/// ```
class AppFilterBar<T> extends StatelessWidget {
  final List<FilterItem<T>> filters;

  /// The currently selected value. Null means "All" is active.
  final T? selectedValue;

  /// Called when a filter is tapped. Passes null when "All" is selected.
  final ValueChanged<T?> onFilterChanged;

  const AppFilterBar({
    super.key,
    required this.filters,
    this.selectedValue,
    required this.onFilterChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
        children: [
          // "All" chip
          Padding(
            padding: const EdgeInsets.only(right: AppTheme.spacingSm),
            child: FilterChip(
              label: const Text('All'),
              selected: selectedValue == null,
              onSelected: (_) => onFilterChanged(null),
            ),
          ),
          // Individual filter chips
          ...filters.map((f) {
            final isSelected = f.value == selectedValue;
            return Padding(
              padding: const EdgeInsets.only(right: AppTheme.spacingSm),
              child: FilterChip(
                label: Text(f.label),
                selected: isSelected,
                onSelected: (_) {
                  onFilterChanged(isSelected ? null : f.value);
                },
              ),
            );
          }),
        ],
      ),
    );
  }
}
