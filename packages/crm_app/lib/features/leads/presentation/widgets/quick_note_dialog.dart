import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import 'note_editor.dart';

/// A bottom-sheet with a compact [NoteEditor] for quickly adding / editing a note.
///
/// Returns the serialised Quill Delta JSON string on save, or null if cancelled.
class QuickNoteDialog extends StatefulWidget {
  final String? initialContent;

  const QuickNoteDialog({super.key, this.initialContent});

  /// Shows the dialog and returns the Delta JSON string (or null).
  static Future<String?> show(
    BuildContext context, {
    String? initialContent,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => QuickNoteDialog(initialContent: initialContent),
    );
  }

  @override
  State<QuickNoteDialog> createState() => _QuickNoteDialogState();
}

class _QuickNoteDialogState extends State<QuickNoteDialog> {
  String _content = '';

  @override
  void initState() {
    super.initState();
    _content = widget.initialContent ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.viewInsetsOf(context);

    return SizedBox(
      height: 420 + viewInsets.bottom,
      child: Column(
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
            child: Row(
              children: [
                Text('Note', style: theme.textTheme.titleMedium),
                const Spacer(),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: AppTheme.spacingSm),
                FilledButton(
                  onPressed: _content.trim().isEmpty
                      ? null
                      : () => Navigator.pop(context, _content),
                  child: const Text('Save'),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: NoteEditor(
              initialContent: widget.initialContent,
              onChanged: (v) => setState(() => _content = v),
            ),
          ),
          SizedBox(height: viewInsets.bottom),
        ],
      ),
    );
  }
}
