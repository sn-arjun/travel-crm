import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // Primary
  static const Color primary = Color(0xFF1565C0);
  static const Color primaryLight = Color(0xFF5E92F3);
  static const Color primaryDark = Color(0xFF003C8F);

  // Secondary
  static const Color secondary = Color(0xFF00897B);
  static const Color secondaryLight = Color(0xFF4DB6AC);

  // Status
  static const Color assigned = Color(0xFFF57C00);   // Orange
  static const Color accepted = Color(0xFF1976D2);    // Blue
  static const Color enRoute = Color(0xFF7B1FA2);     // Purple
  static const Color started = Color(0xFF388E3C);     // Green
  static const Color completed = Color(0xFF757575);   // Grey
  static const Color cancelled = Color(0xFFD32F2F);   // Red

  // General
  static const Color success = Color(0xFF4CAF50);
  static const Color warning = Color(0xFFFFA726);
  static const Color error = Color(0xFFE53935);
  static const Color info = Color(0xFF29B6F6);

  // Background
  static const Color background = Color(0xFFF5F5F5);
  static const Color surface = Colors.white;
  static const Color surfaceVariant = Color(0xFFF0F0F0);

  static Color statusColor(String status) {
    switch (status) {
      case 'assigned':
        return assigned;
      case 'accepted':
        return accepted;
      case 'en_route':
        return enRoute;
      case 'started':
        return started;
      case 'completed':
        return completed;
      case 'cancelled':
        return cancelled;
      default:
        return Colors.grey;
    }
  }
}
