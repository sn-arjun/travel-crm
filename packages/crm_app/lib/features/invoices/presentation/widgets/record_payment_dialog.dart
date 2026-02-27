import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class RecordPaymentDialog extends StatefulWidget {
  final double invoiceAmount;
  final double paidAmount;
  final String currency;
  final VoidCallback? onCancel;
  final Function(Map<String, dynamic>) onConfirm;

  const RecordPaymentDialog({
    super.key,
    required this.invoiceAmount,
    required this.paidAmount,
    required this.currency,
    this.onCancel,
    required this.onConfirm,
  });

  @override
  State<RecordPaymentDialog> createState() => _RecordPaymentDialogState();
}

class _RecordPaymentDialogState extends State<RecordPaymentDialog> {
  late TextEditingController _amountCtrl;
  late TextEditingController _methodCtrl;
  late TextEditingController _typeCtrl;
  late TextEditingController _refCtrl;
  late TextEditingController _notesCtrl;
  late TextEditingController _dateCtrl;

  final List<String> paymentMethods = [
    'Bank Transfer',
    'Check',
    'Cash',
    'Credit Card',
    'UPI',
    'PayPal',
    'Other'
  ];

  final List<String> paymentTypes = ['Full', 'Partial', 'Advance'];

  @override
  void initState() {
    super.initState();
    final balanceDue = widget.invoiceAmount - widget.paidAmount;
    _amountCtrl = TextEditingController(text: balanceDue.toStringAsFixed(2));
    _methodCtrl = TextEditingController(text: 'Bank Transfer');
    _typeCtrl = TextEditingController(text: balanceDue == 0 ? 'Full' : 'Partial');
    _refCtrl = TextEditingController();
    _notesCtrl = TextEditingController();
    _dateCtrl = TextEditingController(
      text: DateTime.now().toIso8601String().split('T')[0],
    );
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _methodCtrl.dispose();
    _typeCtrl.dispose();
    _refCtrl.dispose();
    _notesCtrl.dispose();
    _dateCtrl.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_dateCtrl.text),
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );

    if (selected != null) {
      _dateCtrl.text = selected.toIso8601String().split('T')[0];
    }
  }

  void _submit() {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    widget.onConfirm({
      'amount': amount,
      'method': _methodCtrl.text,
      'type': _typeCtrl.text,
      'referenceNumber': _refCtrl.text.isEmpty ? null : _refCtrl.text,
      'notes': _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
      'paymentDate': _dateCtrl.text,
    });

    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final balanceDue = widget.invoiceAmount - widget.paidAmount;

    return AlertDialog(
      title: const Text('Record Payment'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Balance info
            Card(
              color: theme.colorScheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Invoice Amount:',
                            style: theme.textTheme.bodySmall),
                        Text(
                          '${widget.currency} ${widget.invoiceAmount.toStringAsFixed(2)}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Paid Amount:',
                            style: theme.textTheme.bodySmall),
                        Text(
                          '${widget.currency} ${widget.paidAmount.toStringAsFixed(2)}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const Divider(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Balance Due:',
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            )),
                        Text(
                          '${widget.currency} ${balanceDue.toStringAsFixed(2)}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: AppTheme.spacingLg),

            // Amount
            TextField(
              controller: _amountCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Payment Amount',
                hintText: '0.00',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Payment Method
            DropdownButtonFormField<String>(
              initialValue: _methodCtrl.text,
              decoration: InputDecoration(
                labelText: 'Payment Method',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
              items: paymentMethods
                  .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                  .toList(),
              onChanged: (value) {
                if (value != null) _methodCtrl.text = value;
              },
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Payment Type
            DropdownButtonFormField<String>(
              initialValue: _typeCtrl.text,
              decoration: InputDecoration(
                labelText: 'Payment Type',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
              items: paymentTypes
                  .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                  .toList(),
              onChanged: (value) {
                if (value != null) _typeCtrl.text = value;
              },
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Reference Number
            TextField(
              controller: _refCtrl,
              decoration: InputDecoration(
                labelText: 'Reference Number (optional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Payment Date
            TextField(
              controller: _dateCtrl,
              readOnly: true,
              onTap: () => _selectDate(context),
              decoration: InputDecoration(
                labelText: 'Payment Date',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
                suffixIcon: const Icon(Icons.calendar_today),
              ),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Notes
            TextField(
              controller: _notesCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            widget.onCancel?.call();
            Navigator.of(context).pop();
          },
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _submit,
          child: const Text('Record Payment'),
        ),
      ],
    );
  }
}
