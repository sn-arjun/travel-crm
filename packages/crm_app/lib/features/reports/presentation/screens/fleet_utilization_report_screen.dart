import 'package:flutter/material.dart';
import '../widgets/report_pie_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class FleetUtilizationReportScreen extends StatelessWidget {
  const FleetUtilizationReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'fleet_utilization',
      title: 'Fleet Utilization',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final Map<String, double> pieData = {};
        for (final row in data.data) {
          final type = row['type']?.toString().toUpperCase() ?? 'OTHER';
          // Accumulating pie data by vehicle type instead of individual reg plate
          pieData[type] = (pieData[type] ?? 0.0) + ((row['trip_count'] as num?)?.toDouble() ?? 0.0);
        }

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportPieChart(
                title: 'Trips by Vehicle Type',
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
