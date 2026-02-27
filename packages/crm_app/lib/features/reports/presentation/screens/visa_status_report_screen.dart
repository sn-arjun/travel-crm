import 'package:flutter/material.dart';
import '../widgets/report_pie_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class VisaStatusReportScreen extends StatelessWidget {
  const VisaStatusReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'visa_status_summary',
      title: 'Visa Status Summary',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final Map<String, double> pieData = {};
        for (final row in data.data) {
          final status = row['status']?.toString().toUpperCase() ?? 'UNKNOWN';
          pieData[status] = (pieData[status] ?? 0.0) + ((row['application_count'] as num?)?.toDouble() ?? 0.0);
        }

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportPieChart(
                title: 'Applications by Status',
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
