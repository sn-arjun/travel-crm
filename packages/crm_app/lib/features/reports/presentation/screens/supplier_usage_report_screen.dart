import 'package:flutter/material.dart';
import '../widgets/report_bar_chart.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class SupplierUsageReportScreen extends StatelessWidget {
  const SupplierUsageReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'supplier_usage',
      title: 'Supplier Usage & Bookings',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final labels = data.data.map((row) => row['supplier_name']?.toString() ?? 'Unknown').toList();
        final values = data.data.map((row) => (row['total_spend'] as num?)?.toDouble() ?? 0.0).toList();

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: ReportBarChart(
                title: 'Total Spend by Supplier',
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
