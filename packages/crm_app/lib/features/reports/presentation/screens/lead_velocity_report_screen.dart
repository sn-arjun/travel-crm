import 'package:flutter/material.dart';
import '../widgets/report_line_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class LeadVelocityReportScreen extends StatelessWidget {
  const LeadVelocityReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'lead_velocity',
      title: 'Lead Velocity Rate',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        // Reverse to show chronological order if sorted descending by month in SQL
        final list = data.data.reversed.toList();
        final labels = list.map((row) => row['month']?.toString() ?? 'Uknown').toList();
        final values = list.map((row) => (row['new_leads'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportLineChart(
                title: 'New Leads Over Time',
                labels: labels,
                values: values,
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
