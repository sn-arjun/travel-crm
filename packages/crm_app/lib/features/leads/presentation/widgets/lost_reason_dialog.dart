import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class LostReasonResult {
  final String reason;
  final String? notes;
  const LostReasonResult({required this.reason, this.notes});
}

class LostReasonDialog extends StatefulWidget {
  const LostReasonDialog({super.key});

  static Future<LostReasonResult?> show(BuildContext context) {
    return showDialog<LostReasonResult>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const LostReasonDialog(),
    );
  }

  @override
  State<LostReasonDialog> createState() => _LostReasonDialogState();
}

class _LostReasonDialogState extends State<LostReasonDialog> {
  String? _reason;
  final _notesController = TextEditingController();

  static const _reasons = [
    ('competitor', 'Booked with competitor'),
    ('price_too_high', 'Price too high'),
    ('no_response', 'No response from client'),
    ('changed_plans', 'Client changed plans'),
    ('booked_elsewhere', 'Booked elsewhere'),
    ('other', 'Other'),
  ];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AlertDialog(
      title: const Text('Mark as Lost'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Why was this lead lost?',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: AppTheme.spacingMd),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: _reasons
                    .map((r) => RadioListTile<String>(
                          title: Text(r.$2),
                          value: r.$1,
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Additional notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: theme.colorScheme.error,
          ),
          onPressed: _reason == null
              ? null
              : () => Navigator.pop(
                    context,
                    LostReasonResult(
                      reason: _reason!,
                      notes: _notesController.text.trim().isEmpty
                          ? null
                          : _notesController.text.trim(),
                    ),
                  ),
          child: const Text('Mark as Lost'),
        ),
      ],
    );
  }
}
