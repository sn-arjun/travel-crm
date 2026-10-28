import 'package:flutter/material.dart';

/// Brand colours, taken from the desktop design-system tokens
/// (`--ds-primary` #4F46E5 in light, #818CF8 in dark).
class AppColors {
  AppColors._();

  /// Seed for the light colour scheme (desktop `--ds-primary`).
  static const Color seedLight = Color(0xFF4F46E5);

  /// Seed for the dark colour scheme (desktop dark `--ds-primary`).
  static const Color seedDark = Color(0xFF818CF8);

  /// Brand primary (light theme value).
  static const Color primary = seedLight;

  // Solid feedback colours with enough contrast for white text. Used for
  // snack bars; everything theme-sensitive reads [AppSemantic] instead.
  static const Color success = Color(0xFF047857);
  static const Color warning = Color(0xFFB45309);
  static const Color error = Color(0xFFDC2626);
  static const Color info = Color(0xFF1D4ED8);
}

/// Readable foreground (text / icon) for a solid [background] colour.
Color onSolid(Color background) =>
    ThemeData.estimateBrightnessForColor(background) == Brightness.dark
        ? Colors.white
        : const Color(0xFF0A0A0F);

/// One semantic hue: a strong colour, a soft container and the text/icon
/// colour that reads on that container.
@immutable
class SemanticTone {
  final Color color;
  final Color container;
  final Color onContainer;

  const SemanticTone({
    required this.color,
    required this.container,
    required this.onContainer,
  });
}

/// Success / warning / danger / info / violet tones for the current
/// brightness. Registered on the theme; [AppSemantic.of] also works under a
/// plain `MaterialApp` (it falls back to the matching brightness).
@immutable
class AppSemantic extends ThemeExtension<AppSemantic> {
  final SemanticTone success;
  final SemanticTone warning;
  final SemanticTone danger;
  final SemanticTone info;
  final SemanticTone violet;

  const AppSemantic({
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.violet,
  });

  static const AppSemantic light = AppSemantic(
    success: SemanticTone(
      color: Color(0xFF047857),
      container: Color(0xFFECFDF5),
      onContainer: Color(0xFF04563F),
    ),
    warning: SemanticTone(
      color: Color(0xFFB45309),
      container: Color(0xFFFFFBEB),
      onContainer: Color(0xFF78350F),
    ),
    danger: SemanticTone(
      color: Color(0xFFDC2626),
      container: Color(0xFFFEF2F2),
      onContainer: Color(0xFF991B1B),
    ),
    info: SemanticTone(
      color: Color(0xFF1D4ED8),
      container: Color(0xFFEFF6FF),
      onContainer: Color(0xFF1E3A8A),
    ),
    violet: SemanticTone(
      color: Color(0xFF7C3AED),
      container: Color(0xFFF5F3FF),
      onContainer: Color(0xFF5B21B6),
    ),
  );

  static const AppSemantic dark = AppSemantic(
    success: SemanticTone(
      color: Color(0xFF34D399),
      container: Color(0xFF022C22),
      onContainer: Color(0xFF6EE7B7),
    ),
    warning: SemanticTone(
      color: Color(0xFFFBBF24),
      container: Color(0xFF2A1D05),
      onContainer: Color(0xFFFCD34D),
    ),
    danger: SemanticTone(
      color: Color(0xFFF87171),
      container: Color(0xFF300B0B),
      onContainer: Color(0xFFFCA5A5),
    ),
    info: SemanticTone(
      color: Color(0xFF60A5FA),
      container: Color(0xFF0C1F3D),
      onContainer: Color(0xFF93C5FD),
    ),
    violet: SemanticTone(
      color: Color(0xFFA78BFA),
      container: Color(0xFF2E1065),
      onContainer: Color(0xFFC4B5FD),
    ),
  );

  static AppSemantic of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<AppSemantic>() ??
        (theme.brightness == Brightness.dark ? dark : light);
  }

  @override
  AppSemantic copyWith({
    SemanticTone? success,
    SemanticTone? warning,
    SemanticTone? danger,
    SemanticTone? info,
    SemanticTone? violet,
  }) {
    return AppSemantic(
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
      violet: violet ?? this.violet,
    );
  }

  @override
  AppSemantic lerp(ThemeExtension<AppSemantic>? other, double t) {
    if (other is! AppSemantic) return this;
    return t < 0.5 ? this : other;
  }
}

/// Look of a trip status: label, icon and light/dark-aware colours derived
/// from the colour scheme and [AppSemantic].
///
///   assigned -> primary, accepted -> info (blue), en_route -> warning (amber),
///   started / in_progress -> violet, completed -> success (green),
///   cancelled / rejected -> danger (red).
@immutable
class TripStatusStyle {
  final String label;
  final IconData icon;

  /// Strong accent (dots, icons, borders).
  final Color color;

  /// Soft background for chips and header cards.
  final Color container;

  /// Text / icon colour on [container].
  final Color onContainer;

  const TripStatusStyle({
    required this.label,
    required this.icon,
    required this.color,
    required this.container,
    required this.onContainer,
  });

  static TripStatusStyle of(BuildContext context, String status) {
    final scheme = Theme.of(context).colorScheme;
    final s = AppSemantic.of(context);

    switch (status) {
      case 'assigned':
        return TripStatusStyle(
          label: 'Assigned',
          icon: Icons.assignment_ind_outlined,
          color: scheme.primary,
          container: scheme.primaryContainer,
          onContainer: scheme.onPrimaryContainer,
        );
      case 'accepted':
        return _from('Accepted', Icons.thumb_up_alt_outlined, s.info);
      case 'en_route':
        return _from('En Route', Icons.directions_car_outlined, s.warning);
      case 'started':
      case 'in_progress':
        return _from(
          status == 'started' ? 'Started' : 'In Progress',
          Icons.play_circle_outline,
          s.violet,
        );
      case 'completed':
        return _from('Completed', Icons.check_circle_outline, s.success);
      case 'cancelled':
        return _from('Cancelled', Icons.cancel_outlined, s.danger);
      case 'rejected':
        return _from('Rejected', Icons.block, s.danger);
      default:
        return TripStatusStyle(
          label: status,
          icon: Icons.help_outline,
          color: scheme.onSurfaceVariant,
          container: scheme.surfaceContainerHighest,
          onContainer: scheme.onSurfaceVariant,
        );
    }
  }

  static TripStatusStyle _from(String label, IconData icon, SemanticTone t) {
    return TripStatusStyle(
      label: label,
      icon: icon,
      color: t.color,
      container: t.container,
      onContainer: t.onContainer,
    );
  }
}
