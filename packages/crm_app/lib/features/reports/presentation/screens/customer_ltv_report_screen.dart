import 'package:flutter/material.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';

class CustomerLtvReportScreen extends StatelessWidget {
  const CustomerLtvReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'customer_ltv',
      title: 'Customer Lifetime Value',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final totalLtvSum = data.data.fold(0.0, (sum, row) => sum + ((row['total_ltv'] as num?)?.toDouble() ?? 0.0));
        final avgLtv = totalLtvSum / data.data.length;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24.0),
              child: Center(
                child: Column(
                  children: [
                    Text('Average LTV Across Top Customers', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(
                      '\$${avgLtv.toStringAsFixed(2)}',
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
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
