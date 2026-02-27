import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class SalesSummaryReportScreen extends StatelessWidget {
  const SalesSummaryReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'sales_summary',
      title: 'Sales Summary',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['assigned_to']?.toString() ?? 'Unassigned').toList();
        final values = data.data.map((row) => (row['total_leads'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              child: ReportBarChart(
                title: 'Total Leads by Salesperson',
                labels: labels,
                values: values,
              ),
            ),
            const SizedBox(height: 24),
            // Example of rendering the table representation below or within a toggle
            Expanded(
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
