import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/invoice_provider.dart';

final ageingReportProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) {
  return ref
      .read(invoiceRepositoryProvider)
      .getAgeingReport();
});

class AgeingReportScreen extends ConsumerWidget {
  const AgeingReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(ageingReportProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Ageing Report')),
      body: reportAsync.when(
        loading: () => const AppLoading(),
        error: (error, stackTrace) => AppErrorWidget(
          message: 'Failed to load ageing report',
          onRetry: () => ref.refresh(ageingReportProvider),
        ),
        data: (data) {
          final contacts = (data['data'] as List?)
                  ?.cast<Map<String, dynamic>>() ??
              [];

          if (contacts.isEmpty) {
            return Center(
              child: Text(
                'No outstanding invoices',
                style: theme.textTheme.bodyMedium,
              ),
            );
          }

          return SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  // Summary cards
                  _buildSummaryCards(theme, data),
                  const SizedBox(height: AppTheme.spacingLg),

                  // Ageing table
                  AppSectionCard(
                    title: 'Ageing Breakdown by Contact',
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        columns: const [
                          DataColumn(label: Text('Contact')),
                          DataColumn(label: Text('Total Outstanding')),
                          DataColumn(label: Text('Current')),
                          DataColumn(label: Text('1-30 Days')),
                          DataColumn(label: Text('31-60 Days')),
                          DataColumn(label: Text('61-90 Days')),
                          DataColumn(label: Text('90+ Days')),
                        ],
                        rows: contacts.map((contact) {
                          return DataRow(cells: [
                            DataCell(Text(
                              contact['contactName'] as String? ?? '-',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            )),
                            DataCell(Text(
                              '${contact['currency'] ?? 'INR'} ${(contact['totalOutstanding'] as num?)?.toStringAsFixed(0) ?? '0'}',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            )),
                            DataCell(_buildAgeingCell(
                              (contact['current'] as num?)?.toDouble() ?? 0,
                              contact['currency'] as String? ?? 'INR',
                            )),
                            DataCell(_buildAgeingCell(
                              (contact['days1to30'] as num?)?.toDouble() ?? 0,
                              contact['currency'] as String? ?? 'INR',
                              color: const Color(0xFFFFF9C4),
                            )),
                            DataCell(_buildAgeingCell(
                              (contact['days31to60'] as num?)?.toDouble() ?? 0,
                              contact['currency'] as String? ?? 'INR',
                              color: const Color(0xFFFFE0B2),
                            )),
                            DataCell(_buildAgeingCell(
                              (contact['days61to90'] as num?)?.toDouble() ?? 0,
                              contact['currency'] as String? ?? 'INR',
                              color: const Color(0xFFFFCDD2),
                            )),
                            DataCell(_buildAgeingCell(
                              (contact['days90plus'] as num?)?.toDouble() ?? 0,
                              contact['currency'] as String? ?? 'INR',
                              color: AppColors.error,
                              isDanger: true,
                            )),
                          ]);
                        }).toList(),
                      ),
                    ),
                  ),

                  const SizedBox(height: AppTheme.spacingLg),

                  // Legend
                  _buildLegend(theme),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSummaryCards(ThemeData theme, Map<String, dynamic> data) {
    return Row(
      children: [
        Expanded(
          child: _buildSummaryCard(
            theme,
            'Total Outstanding',
            '${data['currency'] ?? 'INR'} ${(data['totalOutstanding'] as num?)?.toStringAsFixed(0) ?? '0'}',
            AppColors.primary,
          ),
        ),
        const SizedBox(width: AppTheme.spacingMd),
        Expanded(
          child: _buildSummaryCard(
            theme,
            'Current',
            '${data['currency'] ?? 'INR'} ${(data['currentAmount'] as num?)?.toStringAsFixed(0) ?? '0'}',
            AppColors.success,
          ),
        ),
        const SizedBox(width: AppTheme.spacingMd),
        Expanded(
          child: _buildSummaryCard(
            theme,
            '30+ Days Overdue',
            '${data['currency'] ?? 'INR'} ${(data['overdueAmount'] as num?)?.toStringAsFixed(0) ?? '0'}',
            AppColors.error,
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(
    ThemeData theme,
    String title,
    String value,
    Color color,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 4,
                  height: 24,
                  color: color,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAgeingCell(
    double amount,
    String currency, {
    Color? color,
    bool isDanger = false,
  }) {
    if (amount == 0) {
      return const Text('-', style: TextStyle(color: Colors.grey));
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color ?? Colors.transparent,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '$currency ${amount.toStringAsFixed(0)}',
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: isDanger ? Colors.white : Colors.black87,
        ),
      ),
    );
  }

  Widget _buildLegend(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ageing Legend',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Row(
            children: [
              _buildLegendItem('Current', Colors.white),
              const SizedBox(width: AppTheme.spacingLg),
              _buildLegendItem('1-30 Days', const Color(0xFFFFF9C4)),
              const SizedBox(width: AppTheme.spacingLg),
              _buildLegendItem('31-60 Days', const Color(0xFFFFE0B2)),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              _buildLegendItem('61-90 Days', const Color(0xFFFFCDD2)),
              const SizedBox(width: AppTheme.spacingLg),
              _buildLegendItem('90+ Days', AppColors.error),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String label, Color color) {
    return Row(
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: color,
            border: Border.all(color: Colors.grey),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}
