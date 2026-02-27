import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class TeamPerformanceReportScreen extends StatelessWidget {
  const TeamPerformanceReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'team_dashboard',
      title: 'Team Performance',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['team_member']?.toString() ?? 'Unassigned').toList();
        final values = data.data.map((row) => (row['won_deals'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportBarChart(
                title: 'Won Deals by Team Member',
                labels: labels,
                values: values,
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
