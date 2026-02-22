import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class VariableInserter extends StatelessWidget {
  final TextEditingController textController;
  final List<String> variables;

  const VariableInserter({
    required this.textController,
    this.variables = const [
      '{customer_name}',
      '{destination}',
      '{departure_date}',
      '{return_date}',
      '{contact_email}',
      '{contact_phone}',
      '{invoice_number}',
      '{amount}',
    ],
    super.key,
  });

  void _insertVariable(String variable) {
    final text = textController.text;
    final selection = textController.selection;
    final newText = text.replaceRange(
      selection.start,
      selection.end,
      variable,
    );
    textController.text = newText;
    textController.selection = TextSelection.fromPosition(
      TextPosition(offset: selection.start + variable.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Available Variables',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppTheme.spacingSm),
        Wrap(
          spacing: AppTheme.spacingSm,
          runSpacing: AppTheme.spacingSm,
          children: variables.map((variable) {
            return ActionChip(
              label: Text(variable),
              onPressed: () => _insertVariable(variable),
              avatar: Icon(Icons.add_rounded, size: 16),
            );
          }).toList(),
        ),
      ],
    );
  }
}
