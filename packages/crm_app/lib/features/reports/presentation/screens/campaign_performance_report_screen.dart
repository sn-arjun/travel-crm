import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class CampaignPerformanceReportScreen extends StatelessWidget {
  const CampaignPerformanceReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'campaign_performance',
      title: 'Campaign Performance',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['campaign_name']?.toString() ?? 'Organic').toList();
        final values = data.data.map((row) => (row['total_leads'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportBarChart(
                title: 'Total Leads by Campaign Source',
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
