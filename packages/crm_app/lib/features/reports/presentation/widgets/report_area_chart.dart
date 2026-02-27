import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/number_formatter.dart';

class ReportAreaChart extends StatelessWidget {
  final List<String> labels;
  final List<double> values;
  final String title;
  final bool isCurrency;
  final Color lineColor;

  const ReportAreaChart({
    super.key,
    required this.labels,
    required this.values,
    required this.title,
    this.isCurrency = false,
    this.lineColor = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty || values.isEmpty) {
      return const Center(child: Text('No data available'));
    }

    final maxY = values.reduce((a, b) => a > b ? a : b) * 1.2;
    final minY = values.reduce((a, b) => a < b ? a : b);
    final isMinNegative = minY < 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        Expanded(
          child: LineChart(
            LineChartData(
              maxY: maxY == 0 ? 10 : maxY,
              minY: isMinNegative ? minY * 1.2 : 0,
              lineBarsData: [
                LineChartBarData(
                  spots: List.generate(
                    labels.length,
                    (i) => FlSpot(i.toDouble(), values[i]),
                  ),
                  isCurved: true,
                  color: lineColor,
                  barWidth: 3,
                  isStrokeCapRound: true,
                  dotData: const FlDotData(show: false),
                  belowBarData: BarAreaData(
                    show: true,
                    color: lineColor.withValues(alpha: 0.3),
                    gradient: LinearGradient(
                      colors: [
                        lineColor.withValues(alpha: 0.5),
                        lineColor.withValues(alpha: 0.0),
                      ],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ],
              titlesData: FlTitlesData(
                show: true,
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, meta) {
                      final idx = val.toInt();
                      if (idx < 0 || idx >= labels.length || val != idx) return const SizedBox.shrink();
                      // Simplify bottom labels if there are too many
                      if (labels.length > 7 && idx % ((labels.length / 5).ceil()) != 0) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          labels[idx],
                          style: const TextStyle(fontSize: 10),
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
