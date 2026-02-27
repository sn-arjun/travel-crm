import 'package:flutter/material.dart';
import '../widgets/report_pie_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class WinLossReportScreen extends StatelessWidget {
  const WinLossReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'win_loss_analysis',
      title: 'Win/Loss Analysis',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final Map<String, double> pieData = {};
        for (final row in data.data) {
          final status = row['status']?.toString().toUpperCase() ?? 'UNKNOWN';
          pieData[status] = (row['count'] as num?)?.toDouble() ?? 0.0;
        }

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportPieChart(
                title: 'Win/Loss Distribution',
                data: pieData,
                isDonut: true,
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              flex: 1,
              child: ReportDataTable(
                columns: data.columns,
                data: data.data,
              ),
            )
          ],
        );
      },
    );
  }
}
