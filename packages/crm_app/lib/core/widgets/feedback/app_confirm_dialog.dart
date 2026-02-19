import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// A confirmation dialog with Cancel / Confirm buttons.
///
/// ```dart
/// final confirmed = await AppConfirmDialog.show(
///   context,
///   title: 'Delete Contact',
///   message: 'Are you sure you want to delete this contact? This cannot be undone.',
///   destructive: true,
/// );
/// if (confirmed) { ... }
/// ```
class AppConfirmDialog {
  AppConfirmDialog._();

  /// Shows a confirmation dialog and returns `true` if the user confirmed.
  ///
  /// When [destructive] is true the confirm button is rendered in red.
  static Future<bool> show(
    BuildContext context, {
    required String title,
    required String message,
    String confirmLabel = 'Confirm',
    String cancelLabel = 'Cancel',
    bool destructive = false,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final theme = Theme.of(ctx);
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          ),
          title: Text(title),
          content: Text(message, style: theme.textTheme.bodyMedium),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(cancelLabel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: destructive
                  ? FilledButton.styleFrom(backgroundColor: AppTheme.errorColor)
                  : null,
              child: Text(confirmLabel),
            ),
          ],
        );
      },
    );
    return result ?? false;
  }
}
