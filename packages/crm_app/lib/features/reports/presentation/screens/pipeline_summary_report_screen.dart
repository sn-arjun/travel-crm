import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class PipelineSummaryReportScreen extends StatelessWidget {
  const PipelineSummaryReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'pipeline_summary',
      title: 'Pipeline Summary',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['status']?.toString().toUpperCase() ?? 'NEW').toList();
        final values = data.data.map((row) => (row['lead_count'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportBarChart(
                title: 'Active Leads by Pipeline Stage',
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
