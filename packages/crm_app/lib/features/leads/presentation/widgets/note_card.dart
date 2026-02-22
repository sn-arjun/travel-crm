import 'package:flutter/material.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import 'note_editor.dart';

/// A card that renders a read-only note (Quill Delta JSON).
class NoteCard extends StatelessWidget {
  final LeadActivity note;

  /// Called when the user taps Edit.
  final VoidCallback? onEdit;

  /// Called when the user taps Delete.
  final VoidCallback? onDelete;

  /// Whether to show the edit / delete menu.
  final bool canModify;

  const NoteCard({
    super.key,
    required this.note,
    this.onEdit,
    this.onDelete,
    this.canModify = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: author + date + menu
            Row(
              children: [
                CircleAvatar(
                  radius: 14,
                  child: Text(
                    (note.createdByName ?? '?')[0].toUpperCase(),
                    style: theme.textTheme.labelSmall,
                  ),
                ),
                const SizedBox(width: AppTheme.spacingSm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        note.createdByName ?? 'Unknown',
                        style: theme.textTheme.labelMedium,
                      ),
                      if (note.createdAt != null)
                        Text(
                          note.createdAt!,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
                if (canModify)
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert, size: 18),
                    onSelected: (v) {
                      if (v == 'edit') onEdit?.call();
                      if (v == 'delete') onDelete?.call();
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: ListTile(
                          dense: true,
                          leading: Icon(Icons.edit_outlined, size: 18),
                          title: Text('Edit'),
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: ListTile(
                          dense: true,
                          leading: Icon(Icons.delete_outline,
                              size: 18, color: Colors.red),
                          title: Text('Delete',
                              style: TextStyle(color: Colors.red)),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: AppTheme.spacingSm),
            // Note content (read-only Quill editor)
            NoteEditor(
              initialContent: note.content,
              readOnly: true,
            ),
          ],
        ),
      ),
    );
  }
}
