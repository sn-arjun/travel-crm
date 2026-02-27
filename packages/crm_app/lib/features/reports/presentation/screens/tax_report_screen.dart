import 'package:flutter/material.dart';
import '../widgets/report_data_table.dart';
import 'report_screen_template.dart';
import '../../../../core/theme/colors.dart';

class TaxReportScreen extends StatelessWidget {
  const TaxReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportScreenTemplate(
      reportId: 'tax_report',
      title: 'Tax Collection Report',
      chartBuilder: (context, data) {
        if (data.data.isEmpty) return const Text('No data');

        final totalTax = data.data.fold(0.0, (sum, row) => sum + ((row['total_tax'] as num?)?.toDouble() ?? 0.0));
        final totalRevenue = data.data.fold(0.0, (sum, row) => sum + ((row['total_revenue'] as num?)?.toDouble() ?? 0.0));

        return Column(
          children: [
            Expanded(
              flex: 1,
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildKpiCard(context, 'Total Tax Collected', totalTax, AppColors.error),
                    _buildKpiCard(context, 'Total Revenue (Taxable)', totalRevenue, AppColors.primary),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              flex: 2,
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

  Widget _buildKpiCard(BuildContext context, String title, double value, Color color) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, style: TextStyle(color: color, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
            '\$${value.toStringAsFixed(2)}',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
