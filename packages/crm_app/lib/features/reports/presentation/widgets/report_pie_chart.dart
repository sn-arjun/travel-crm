import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/utils/number_formatter.dart';

class ReportPieChart extends StatelessWidget {
  final Map<String, double> data;
  final String title;
  final bool isDonut;
  final bool isCurrency;

  const ReportPieChart({
    super.key,
    required this.data,
    required this.title,
    this.isDonut = false,
    this.isCurrency = false,
  });

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return const Center(child: Text('No data available'));
    }

    final colors = [
      AppColors.primary,
      AppColors.secondary,
      AppColors.success,
      AppColors.warning,
      Colors.purple,
      Colors.teal,
      Colors.indigo,
      Colors.orange,
    ];

    double total = data.values.fold(0.0, (sum, val) => sum + val);

    int colorIndex = 0;
    final sections = data.entries.map((entry) {
      final value = entry.value;
      final percentage = total > 0 ? (value / total) * 100 : 0;
      final color = colors[colorIndex % colors.length];
      colorIndex++;

      return PieChartSectionData(
        color: color,
        value: value,
        title: '${percentage.toStringAsFixed(1)}%',
        radius: isDonut ? 40 : 80,
        titleStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      );
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        Expanded(
          child: Row(
            children: [
              Expanded(
                flex: 2,
                child: PieChart(
                  PieChartData(
                    pieTouchData: PieTouchData(enabled: true),
                    borderData: FlBorderData(show: false),
                    sectionsSpace: 2,
                    centerSpaceRadius: isDonut ? 40 : 0,
                    sections: sections,
                  ),
                ),
              ),
              Expanded(
                flex: 1,
                child: _buildLegend(colors),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLegend(List<Color> colors) {
    return ListView.builder(
      itemCount: data.length,
      itemBuilder: (context, index) {
        final entry = data.entries.elementAt(index);
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: colors[index % colors.length],
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  entry.key,
                  style: const TextStyle(fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                isCurrency ? NumberFormatter.compactCurrency(entry.value) : NumberFormatter.compact(entry.value),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        );
      },
    );
  }
}
