import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// Static helper for showing themed snackbars.
///
/// ```dart
/// AppSnackbar.success(context, 'Contact saved successfully');
/// AppSnackbar.error(context, 'Failed to save contact');
/// AppSnackbar.warning(context, 'Unsaved changes');
/// AppSnackbar.info(context, '3 new leads imported');
/// ```
class AppSnackbar {
  AppSnackbar._();

  static void success(BuildContext context, String message) {
    _show(context, message: message, icon: Icons.check_circle_outline, color: AppTheme.successColor);
  }

  static void error(BuildContext context, String message) {
    _show(context, message: message, icon: Icons.error_outline, color: AppTheme.errorColor);
  }

  static void warning(BuildContext context, String message) {
    _show(context, message: message, icon: Icons.warning_amber_outlined, color: AppTheme.warningColor);
  }

  static void info(BuildContext context, String message) {
    _show(context, message: message, icon: Icons.info_outline, color: AppTheme.infoColor);
  }

  static void _show(
    BuildContext context, {
    required String message,
    required IconData icon,
    required Color color,
    Duration duration = const Duration(seconds: 3),
  }) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(AppTheme.spacingMd),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          ),
          backgroundColor: color,
          duration: duration,
          content: Row(
            children: [
              Icon(icon, color: Colors.white, size: 20),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      );
  }
}
