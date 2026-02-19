import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// A date picker field that opens the Material date picker on tap.
///
/// Displays the selected date formatted in the text field. Supports optional
/// [firstDate] / [lastDate] constraints and custom [dateFormat].
class AppDatePicker extends StatelessWidget {
  final String? label;
  final String? hint;
  final DateTime? selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  final DateTime? firstDate;
  final DateTime? lastDate;
  final String dateFormat;
  final String? Function(String?)? validator;
  final bool enabled;

  const AppDatePicker({
    super.key,
    this.label,
    this.hint,
    this.selectedDate,
    required this.onDateSelected,
    this.firstDate,
    this.lastDate,
    this.dateFormat = 'dd MMM yyyy',
    this.validator,
    this.enabled = true,
  });

  Future<void> _pickDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate ?? now,
      firstDate: firstDate ?? DateTime(2000),
      lastDate: lastDate ?? DateTime(2100),
    );
    if (picked != null) {
      onDateSelected(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final displayText =
        selectedDate != null ? DateFormat(dateFormat).format(selectedDate!) : '';

    return TextFormField(
      readOnly: true,
      controller: TextEditingController(text: displayText),
      validator: validator,
      onTap: enabled ? () => _pickDate(context) : null,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint ?? 'Select date',
        suffixIcon: const Icon(Icons.calendar_today_outlined),
      ),
    );
  }
}
