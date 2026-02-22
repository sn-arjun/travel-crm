import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// A bottom bar showing real-time price totals for the itinerary (TICKET-089).
///
/// Displays total cost, total selling, tax, and grand total with
/// currency formatting. The cost column and profit margin are only
/// shown when [showCost] is true (typically for admin/manager roles).
class PriceSummaryBar extends StatelessWidget {
  final double totalCost;
  final double totalSelling;
  final double totalTax;
  final double grandTotal;
  final String currency;

  /// When true, shows the cost column and profit margin percentage.
  /// Set to false for agent-level users who should not see cost data.
  final bool showCost;

  const PriceSummaryBar({
    super.key,
    required this.totalCost,
    required this.totalSelling,
    required this.totalTax,
    required this.grandTotal,
    this.currency = 'INR',
    this.showCost = false,
  });

  String _currencySymbol() {
    switch (currency) {
      case 'USD':
        return '\$';
      case 'EUR':
        return '\u20AC';
      case 'GBP':
        return '\u00A3';
      case 'INR':
      default:
        return '\u20B9';
    }
  }

  String _formatAmount(double amount) {
    final symbol = _currencySymbol();
    // Format with comma separators and 2 decimal places
    final parts = amount.toStringAsFixed(2).split('.');
    final intPart = parts[0];
    final decPart = parts[1];

    // Add comma separators (Indian numbering for INR, otherwise standard)
    String formatted;
    if (currency == 'INR' && intPart.length > 3) {
      final last3 = intPart.substring(intPart.length - 3);
      String remaining = intPart.substring(0, intPart.length - 3);
      final buffer = StringBuffer();
      while (remaining.length > 2) {
        buffer.write('${remaining.substring(0, remaining.length - 2)},');
        remaining = remaining.substring(remaining.length - 2);
      }
      buffer.write(remaining);
      formatted = '${buffer.toString().isEmpty ? '' : '${buffer.toString()},'}$last3';
    } else {
      formatted = intPart.replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (match) => '${match[1]},',
      );
    }

    return '$symbol$formatted.$decPart';
  }

  double get _profitMargin {
    if (totalSelling <= 0) return 0;
    return ((totalSelling - totalCost) / totalSelling) * 100;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : AppTheme.surfaceLight,
        border: Border(
          top: BorderSide(
            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Cost (only for admin/manager)
            if (showCost) ...[
              _PriceTile(
                label: 'Total Cost',
                value: _formatAmount(totalCost),
                valueColor: theme.colorScheme.onSurface,
              ),
              const SizedBox(width: AppTheme.spacingMd),
            ],

            // Selling
            _PriceTile(
              label: 'Total Selling',
              value: _formatAmount(totalSelling),
              valueColor: AppTheme.primaryColor,
            ),
            const SizedBox(width: AppTheme.spacingMd),

            // Tax
            _PriceTile(
              label: 'Tax',
              value: _formatAmount(totalTax),
              valueColor: theme.colorScheme.onSurface,
            ),
            const SizedBox(width: AppTheme.spacingMd),

            // Grand Total
            Expanded(
              child: _PriceTile(
                label: 'Grand Total',
                value: _formatAmount(grandTotal),
                valueColor: AppTheme.successColor,
                isBold: true,
              ),
            ),

            // Profit margin (only for admin/manager)
            if (showCost)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingSm,
                  vertical: AppTheme.spacingXs,
                ),
                decoration: BoxDecoration(
                  color: _profitMargin >= 0
                      ? AppTheme.successColor.withValues(alpha: 0.1)
                      : AppTheme.errorColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Margin',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                    Text(
                      '${_profitMargin.toStringAsFixed(1)}%',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: _profitMargin >= 0
                            ? AppTheme.successColor
                            : AppTheme.errorColor,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PriceTile extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;
  final bool isBold;

  const _PriceTile({
    required this.label,
    required this.value,
    required this.valueColor,
    this.isBold = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w600,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}
