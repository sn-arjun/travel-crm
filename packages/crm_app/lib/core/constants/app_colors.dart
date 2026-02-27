import 'package:flutter/material.dart';

/// App color constants — mirrors theme tokens for direct usage
class AppColors {
  AppColors._();

  // Primary
  static const primary = Color(0xFF1E88E5);
  static const primaryLight = Color(0xFF64B5F6);
  static const primaryDark = Color(0xFF1565C0);

  // Secondary
  static const secondary = Color(0xFF26A69A);

  // Status
  static const success = Color(0xFF4CAF50);
  static const warning = Color(0xFFFFA726);
  static const error = Color(0xFFEF5350);
  static const info = Color(0xFF29B6F6);

  // Lead Priority
  static const hot = Color(0xFFEF5350);
  static const warm = Color(0xFFFFA726);
  static const cold = Color(0xFF42A5F5);

  // Pipeline Stages
  static const stageNew = Color(0xFF90CAF9);
  static const stageContacted = Color(0xFF80DEEA);
  static const stageProposal = Color(0xFFFFF176);
  static const stageNegotiation = Color(0xFFFFCC80);
  static const stageBooking = Color(0xFFA5D6A7);
  static const stageCompleted = Color(0xFF4CAF50);
  static const stageLost = Color(0xFFEF9A9A);

  // Neutral
  static const divider = Color(0xFFE0E0E0);
}
