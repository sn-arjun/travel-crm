import 'package:flutter/material.dart';

/// Breakpoints used across the app.
class Breakpoints {
  Breakpoints._();

  static const double mobile = 600;
  static const double tablet = 1200;

  /// Returns true when width < [mobile].
  static bool isMobile(double width) => width < mobile;

  /// Returns true when width >= [mobile] and < [tablet].
  static bool isTablet(double width) => width >= mobile && width < tablet;

  /// Returns true when width >= [tablet].
  static bool isDesktop(double width) => width >= tablet;
}

/// The current device class inferred from screen width.
enum DeviceType { mobile, tablet, desktop }

/// A responsive layout builder that renders different widgets for
/// mobile / tablet / desktop breakpoints.
///
/// [tablet] and [desktop] fall back to the next smaller layout if null.
///
/// ```dart
/// AppResponsiveBuilder(
///   mobile: MobileContactList(),
///   tablet: TabletContactList(),
///   desktop: DesktopContactList(),
/// )
/// ```
class AppResponsiveBuilder extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;

  const AppResponsiveBuilder({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  /// Returns the current [DeviceType] for the given [context].
  static DeviceType deviceType(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (Breakpoints.isDesktop(width)) return DeviceType.desktop;
    if (Breakpoints.isTablet(width)) return DeviceType.tablet;
    return DeviceType.mobile;
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;

    if (Breakpoints.isDesktop(width)) {
      return desktop ?? tablet ?? mobile;
    }
    if (Breakpoints.isTablet(width)) {
      return tablet ?? mobile;
    }
    return mobile;
  }
}
