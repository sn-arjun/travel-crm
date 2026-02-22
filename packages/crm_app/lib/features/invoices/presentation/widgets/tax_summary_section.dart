import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../core/constants/app_colors.dart';

class TaxSummarySection extends StatelessWidget {
  final double subtotal;
  final double discountAmount;
  final double taxAmount;
  final double total;
  final String currency;
  final List<Map<String, dynamic>> taxBreakdown;
  final String? taxType; // GST, VAT, etc.

  const TaxSummarySection({
    super.key,
    required this.subtotal,
    required this.discountAmount,
    required this.taxAmount,
    required this.total,
    required this.currency,
    this.taxBreakdown = const [],
    this.taxType,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Subtotal
          _buildRow(
            theme,
            label: 'Subtotal',
            value: '$currency ${subtotal.toStringAsFixed(2)}',
            isBold: false,
          ),

          if (discountAmount > 0) ...[
            const SizedBox(height: AppTheme.spacingSm),
            _buildRow(
              theme,
              label: 'Discount',
              value: '- $currency ${discountAmount.toStringAsFixed(2)}',
              valueColor: AppColors.success,
              isBold: false,
            ),
          ],

          // Tax breakdown (if available)
          if (taxBreakdown.isNotEmpty) ...[
            const SizedBox(height: AppTheme.spacingSm),
            const Divider(),
            const SizedBox(height: AppTheme.spacingSm),
            ...taxBreakdown.map((tax) {
              return Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
                child: _buildRow(
                  theme,
                  label: '${tax['name'] ?? 'Tax'} (${tax['rate']}%)',
                  value: '$currency ${(tax['amount'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                  isBold: false,
                ),
              );
            }),
          ] else if (taxAmount > 0) ...[
            const SizedBox(height: AppTheme.spacingSm),
            _buildRow(
              theme,
              label: '${taxType ?? 'Tax'}',
              value: '+ $currency ${taxAmount.toStringAsFixed(2)}',
              isBold: false,
            ),
          ],

          const SizedBox(height: AppTheme.spacingSm),
          const Divider(),
          const SizedBox(height: AppTheme.spacingSm),

          // Total
          _buildRow(
            theme,
            label: 'Total',
            value: '$currency ${total.toStringAsFixed(2)}',
            isBold: true,
            valueColor: AppColors.primary,
          ),
        ],
      ),
    );
  }

  Widget _buildRow(
    ThemeData theme, {
    required String label,
    required String value,
    bool isBold = false,
    Color? valueColor,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}
