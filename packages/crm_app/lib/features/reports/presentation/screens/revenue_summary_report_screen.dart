import 'package:flutter/material.dart';
import '../widgets/report_line_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class RevenueSummaryReportScreen extends StatelessWidget {
  const RevenueSummaryReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'revenue_summary',
      title: 'Revenue Summary',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        // Assuming status as x-labels for now, though a real revenue chart 
        // usually plots over time. If we grouped by date, labels would be dates.
        final labels = data.data.map((row) => row['status']?.toString() ?? 'Unpaid').toList();
        final values = data.data.map((row) => (row['total_amount'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportLineChart(
                title: 'Revenue by Invoice Status',
                labels: labels,
                values: values,
                isCurrency: true,
                isArea: true,
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
