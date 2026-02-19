import 'package:flutter/material.dart';

class AppSpacing {
  AppSpacing._();

  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;

  // Gaps (SizedBox shortcuts)
  static const gapXs = SizedBox(width: xs, height: xs);
  static const gapSm = SizedBox(width: sm, height: sm);
  static const gapMd = SizedBox(width: md, height: md);
  static const gapLg = SizedBox(width: lg, height: lg);
  static const gapXl = SizedBox(width: xl, height: xl);

  // Horizontal gaps
  static const gapHXs = SizedBox(width: xs);
  static const gapHSm = SizedBox(width: sm);
  static const gapHMd = SizedBox(width: md);
  static const gapHLg = SizedBox(width: lg);

  // Vertical gaps
  static const gapVXs = SizedBox(height: xs);
  static const gapVSm = SizedBox(height: sm);
  static const gapVMd = SizedBox(height: md);
  static const gapVLg = SizedBox(height: lg);

  // Padding
  static const paddingAllXs = EdgeInsets.all(xs);
  static const paddingAllSm = EdgeInsets.all(sm);
  static const paddingAllMd = EdgeInsets.all(md);
  static const paddingAllLg = EdgeInsets.all(lg);

  static const paddingHMd = EdgeInsets.symmetric(horizontal: md);
  static const paddingVMd = EdgeInsets.symmetric(vertical: md);
  static const paddingHLg = EdgeInsets.symmetric(horizontal: lg);
}
