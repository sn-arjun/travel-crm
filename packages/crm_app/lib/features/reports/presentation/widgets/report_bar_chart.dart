import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/number_formatter.dart';

class ReportBarChart extends StatelessWidget {
  final List<String> labels;
  final List<double> values;
  final String title;
  final bool isCurrency;
  final Color barColor;

  const ReportBarChart({
    super.key,
    required this.labels,
    required this.values,
    required this.title,
    this.isCurrency = false,
    this.barColor = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty || values.isEmpty) {
      return const Center(child: Text('No data available'));
    }

    final maxY = values.reduce((a, b) => a > b ? a : b) * 1.2;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        Expanded(
          child: BarChart(
            BarChartData(
              alignment: BarChartAlignment.spaceAround,
              maxY: maxY == 0 ? 10 : maxY,
              barGroups: List.generate(
                labels.length,
                (i) => BarChartGroupData(
                  x: i,
                  barRods: [
                    BarChartRodData(
                      toY: values[i],
                      color: barColor,
                      width: 20,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                    )
                  ],
                ),
              ),
              titlesData: FlTitlesData(
                show: true,
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, meta) {
                      if (val < 0 || val >= labels.length) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          labels[val.toInt()],
                          style: const TextStyle(fontSize: 10),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    },
                    reservedSize: 32,
                  ),
                ),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, meta) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Text(
                          isCurrency ? NumberFormatter.compactCurrency(val) : NumberFormatter.compact(val),
                          style: const TextStyle(fontSize: 10),
                        ),
                      );
                    },
                    reservedSize: 40,
                  ),
                ),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: false),
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: maxY > 0 ? maxY / 4 : 1,
                getDrawingHorizontalLine: (value) => const FlLine(
                  color: AppColors.divider,
                  strokeWidth: 1,
                  dashArray: [5, 5],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
