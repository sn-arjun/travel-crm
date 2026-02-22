import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme.dart';

/// A combined currency selector + amount text field.
class BudgetInput extends StatelessWidget {
  final String currency;
  final double? amount;
  final ValueChanged<String> onCurrencyChanged;
  final ValueChanged<double?> onAmountChanged;

  static const _currencies = ['INR', 'USD', 'EUR', 'AED', 'GBP'];

  const BudgetInput({
    super.key,
    required this.currency,
    required this.amount,
    required this.onCurrencyChanged,
    required this.onAmountChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Currency selector
        SizedBox(
          width: 100,
          child: DropdownButtonFormField<String>(
            initialValue: currency,
            decoration: const InputDecoration(
              labelText: 'Currency',
              border: OutlineInputBorder(),
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            items: _currencies
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (v) => onCurrencyChanged(v ?? currency),
          ),
        ),
        const SizedBox(width: AppTheme.spacingSm),
        // Amount field
        Expanded(
          child: TextFormField(
            initialValue: amount != null ? amount.toString() : '',
            decoration: const InputDecoration(
              labelText: 'Budget',
              hintText: '0.00',
              border: OutlineInputBorder(),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
            ],
            onChanged: (v) => onAmountChanged(double.tryParse(v)),
          ),
        ),
      ],
    );
  }
}
