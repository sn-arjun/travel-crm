import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class CollectionsReportScreen extends StatelessWidget {
  const CollectionsReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'collections_report',
      title: 'Collections Report',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['method']?.toString() ?? 'Unknown').toList();
        final values = data.data.map((row) => (row['collected_amount'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportBarChart(
                title: 'Collected Amount by Payment Method',
                labels: labels,
                values: values,
                isCurrency: true,
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
