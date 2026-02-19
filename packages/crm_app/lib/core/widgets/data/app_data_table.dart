import 'package:flutter/material.dart';

import '../../../app/theme.dart';

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

/// Describes a single column in an [AppDataTable].
class AppDataColumn {
  final String title;
  final String field;
  final bool sortable;
  final double? width;
  final Widget Function(dynamic value)? cellBuilder;

  const AppDataColumn({
    required this.title,
    required this.field,
    this.sortable = false,
    this.width,
    this.cellBuilder,
  });
}

// ---------------------------------------------------------------------------
// Pagination state
// ---------------------------------------------------------------------------

class PaginationState {
  final int page;
  final int pageSize;
  final int total;

  const PaginationState({
    required this.page,
    this.pageSize = 20,
    required this.total,
  });

  int get totalPages => (total / pageSize).ceil().clamp(1, 999999);
}

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

class SortState {
  final String field;
  final bool ascending;

  const SortState({required this.field, required this.ascending});
}

// ---------------------------------------------------------------------------
// AppDataTable
// ---------------------------------------------------------------------------

/// A generic, sortable, paginated data table with optional row selection.
///
/// [T] is the row data type. [rowValueFor] extracts a cell value given a row
/// object and a column field name.
class AppDataTable<T> extends StatelessWidget {
  final List<AppDataColumn> columns;
  final List<T> rows;
  final dynamic Function(T row, String field) rowValueFor;
  final SortState? sortState;
  final ValueChanged<SortState>? onSort;
  final PaginationState? pagination;
  final ValueChanged<int>? onPageChanged;

  // Row selection
  final bool selectable;
  final Set<int>? selectedIndices;
  final ValueChanged<Set<int>>? onSelectionChanged;

  // Empty state
  final Widget? emptyState;

  const AppDataTable({
    super.key,
    required this.columns,
    required this.rows,
    required this.rowValueFor,
    this.sortState,
    this.onSort,
    this.pagination,
    this.onPageChanged,
    this.selectable = false,
    this.selectedIndices,
    this.onSelectionChanged,
    this.emptyState,
  });

  void _handleSort(AppDataColumn col) {
    if (!col.sortable || onSort == null) return;
    final isCurrentField = sortState?.field == col.field;
    onSort!(SortState(
      field: col.field,
      ascending: isCurrentField ? !(sortState!.ascending) : true,
    ));
  }

  void _toggleRow(int index) {
    if (onSelectionChanged == null) return;
    final current = Set<int>.from(selectedIndices ?? {});
    if (current.contains(index)) {
      current.remove(index);
    } else {
      current.add(index);
    }
    onSelectionChanged!(current);
  }

  void _toggleAll() {
    if (onSelectionChanged == null) return;
    final current = selectedIndices ?? {};
    if (current.length == rows.length) {
      onSelectionChanged!({});
    } else {
      onSelectionChanged!(Set<int>.from(List.generate(rows.length, (i) => i)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return emptyState ??
          const Center(
            child: Padding(
              padding: EdgeInsets.all(AppTheme.spacingXl),
              child: Text('No data available'),
            ),
          );
    }

    final theme = Theme.of(context);

    return Column(
      children: [
        // Table
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SingleChildScrollView(
              child: DataTable(
                sortColumnIndex: sortState != null
                    ? columns.indexWhere((c) => c.field == sortState!.field)
                    : null,
                sortAscending: sortState?.ascending ?? true,
                showCheckboxColumn: selectable,
                headingRowColor: WidgetStateProperty.all(
                  theme.colorScheme.surfaceContainerHighest,
                ),
                columns: [
                  if (selectable)
                    DataColumn(
                      label: Checkbox(
                        value: (selectedIndices?.length ?? 0) == rows.length &&
                            rows.isNotEmpty,
                        tristate: (selectedIndices?.isNotEmpty ?? false) &&
                            (selectedIndices!.length < rows.length),
                        onChanged: (_) => _toggleAll(),
                      ),
                    ),
                  ...columns.map((col) {
                    return DataColumn(
                      label: Text(
                        col.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onSort: col.sortable ? (_, _) => _handleSort(col) : null,
                    );
                  }),
                ],
                rows: List.generate(rows.length, (i) {
                  final row = rows[i];
                  final isSelected = selectedIndices?.contains(i) ?? false;

                  return DataRow(
                    selected: isSelected,
                    onSelectChanged: selectable ? (_) => _toggleRow(i) : null,
                    cells: [
                      if (selectable)
                        DataCell(
                          Checkbox(
                            value: isSelected,
                            onChanged: (_) => _toggleRow(i),
                          ),
                        ),
                      ...columns.map((col) {
                        final value = rowValueFor(row, col.field);
                        return DataCell(
                          col.cellBuilder != null
                              ? col.cellBuilder!(value)
                              : Text('${value ?? ''}'),
                        );
                      }),
                    ],
                  );
                }),
              ),
            ),
          ),
        ),

        // Pagination
        if (pagination != null) _buildPagination(context),
      ],
    );
  }

  Widget _buildPagination(BuildContext context) {
    final pg = pagination!;
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Showing ${((pg.page - 1) * pg.pageSize) + 1}'
            ' - ${(pg.page * pg.pageSize).clamp(0, pg.total)}'
            ' of ${pg.total}',
            style: theme.textTheme.bodySmall,
          ),
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: pg.page > 1
                    ? () => onPageChanged?.call(pg.page - 1)
                    : null,
              ),
              Text('${pg.page} / ${pg.totalPages}',
                  style: theme.textTheme.bodyMedium),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: pg.page < pg.totalPages
                    ? () => onPageChanged?.call(pg.page + 1)
                    : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
