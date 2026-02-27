import 'package:flutter/material.dart';
import '../../../../core/utils/number_formatter.dart';
import 'package:intl/intl.dart';
import '../../data/models/report_state.dart';

class ReportDataTable extends StatelessWidget {
  final List<ReportColumnDef> columns;
  final List<Map<String, dynamic>> data;
  final String? sortColumn;
  final bool isSortAscending;
  final Function(String key, bool ascending)? onSort;
  final void Function(String columnKey, Map<String, dynamic> row)? onDrillDown;
  final Map<String, dynamic>? previousPeriodData;
  final String? groupByColumn;

  const ReportDataTable({
    super.key,
    required this.columns,
    required this.data,
    this.sortColumn,
    this.isSortAscending = true,
    this.onSort,
    this.onDrillDown,
    this.previousPeriodData,
    this.groupByColumn,
  });

  static bool _isNumericType(String type) =>
      ['number', 'currency', 'percentage'].contains(type);

  static String _labelFromName(String name) =>
      name.replaceAll('_', ' ').toUpperCase();

  @override
  Widget build(BuildContext context) {
    if (columns.isEmpty) return const SizedBox.shrink();

    int sortColumnIndex = 0;
    if (sortColumn != null) {
      sortColumnIndex = columns.indexWhere((c) => c.name == sortColumn);
      if (sortColumnIndex == -1) sortColumnIndex = 0;
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        sortColumnIndex: sortColumnIndex,
        sortAscending: isSortAscending,
        headingRowColor: WidgetStateProperty.resolveWith(
            (states) => Theme.of(context).colorScheme.surfaceContainerHighest),
        columns: columns.map((col) {
          return DataColumn(
            label: Text(
              _labelFromName(col.name),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            numeric: _isNumericType(col.type),
            onSort: (columnIndex, ascending) {
              if (onSort != null) {
                onSort!(columns[columnIndex].name, ascending);
              }
            },
          );
        }).toList(),
        rows: data.map((row) {
          return DataRow(
            cells: columns.map((col) {
              final hasDrillDown = col.drillDown != null;
              return DataCell(
                _buildCellContent(context, col, row),
                onTap: hasDrillDown && onDrillDown != null
                    ? () => onDrillDown!(col.name, row)
                    : null,
              );
            }).toList(),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCellContent(
      BuildContext context, ReportColumnDef col, Map<String, dynamic> row) {
    final value = row[col.name];
    if (value == null) {
      return const Text('-');
    }

    Widget content;
    switch (col.type) {
      case 'currency':
        if (value is num) {
          content = Text(NumberFormatter.formatCurrency(value.toDouble()));
        } else {
          content = Text(value.toString());
        }
        break;
      case 'number':
        if (value is num) {
          content = Text(NumberFormatter.format(value.toDouble()));
        } else {
          content = Text(value.toString());
        }
        break;
      case 'percentage':
        if (value is num) {
          content = Text('${value.toStringAsFixed(1)}%');
        } else {
          content = Text(value.toString());
        }
        break;
      case 'date':
        if (value is String) {
          try {
            final date = DateTime.parse(value);
            content = Text(DateFormat.yMMMd().format(date));
          } catch (_) {
            content = Text(value.toString());
          }
        } else {
          content = Text(value.toString());
        }
        break;
      case 'status':
        content = _buildStatusChip(value.toString());
        break;
      default:
        content = Text(value.toString());
    }

    final isNumeric = _isNumericType(col.type);
    if (previousPeriodData != null && isNumeric) {
      dynamic prevValue;
      if (groupByColumn != null) {
        final groupKey = row[groupByColumn!];
        if (groupKey != null) {
          final groupStr = groupKey.toString();
          if (previousPeriodData!.containsKey(groupStr)) {
            prevValue = previousPeriodData![groupStr][col.name];
          }
        }
      } else {
        prevValue = previousPeriodData![col.name];
      }

      if (prevValue != null && prevValue is num && value is num) {
        final double current = value.toDouble();
        final double previous = prevValue.toDouble();

        if (previous != 0 || current != 0) {
          final double delta = current - previous;
          final double pct = previous != 0
              ? (delta / previous) * 100
              : (current > 0 ? 100.0 : -100.0);

          final bool isPositive = delta > 0;
          final bool isNegative = delta < 0;

          final Color color = isPositive
              ? Colors.green
              : (isNegative ? Colors.red : Colors.grey);
          final IconData icon = isPositive
              ? Icons.arrow_upward
              : (isNegative ? Icons.arrow_downward : Icons.remove);

          final bool isHoveringZero = pct.abs() < 0.1 && pct != 0;
          final String displayPct =
              isHoveringZero ? '0.0' : pct.abs().toStringAsFixed(1);

          content = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              content,
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 12, color: color),
                    const SizedBox(width: 2),
                    Text('$displayPct%',
                        style: TextStyle(
                            fontSize: 10,
                            color: color,
                            fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          );
        }
      }
    }

    if (col.drillDown != null) {
      return DefaultTextStyle.merge(
        style: TextStyle(
          color: Theme.of(context).colorScheme.primary,
          decoration: TextDecoration.underline,
          fontWeight: FontWeight.w600,
        ),
        child: content,
      );
    }

    return content;
  }

  Widget _buildStatusChip(String status) {
    Color bgColor = Colors.grey.shade200;
    Color textColor = Colors.grey.shade800;

    final lower = status.toLowerCase();
    if (lower.contains('paid') ||
        lower.contains('won') ||
        lower.contains('success')) {
      bgColor = Colors.green.shade100;
      textColor = Colors.green.shade800;
    } else if (lower.contains('overdue') ||
        lower.contains('lost') ||
        lower.contains('failed')) {
      bgColor = Colors.red.shade100;
      textColor = Colors.red.shade800;
    } else if (lower.contains('pending') || lower.contains('progress')) {
      bgColor = Colors.orange.shade100;
      textColor = Colors.orange.shade800;
    } else if (lower.contains('sent') || lower.contains('new')) {
      bgColor = Colors.blue.shade100;
      textColor = Colors.blue.shade800;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: textColor,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
