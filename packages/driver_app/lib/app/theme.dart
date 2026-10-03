import 'package:flutter/material.dart';
import '../core/constants/app_colors.dart';

/// Corner radii shared by cards and inputs.
class AppRadius {
  AppRadius._();

  static const double card = 14;
  static const double input = 12;
}

/// Material 3 theme for the driver app, aligned with the desktop design
/// system (indigo #4F46E5 in light, #818CF8 in dark).
class AppTheme {
  AppTheme._();

  static const double radius = AppRadius.card;
  static const double inputRadius = AppRadius.input;

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ColorScheme _scheme(Brightness brightness) {
    if (brightness == Brightness.light) {
      return ColorScheme.fromSeed(
        seedColor: AppColors.seedLight,
        brightness: Brightness.light,
      ).copyWith(
        primary: const Color(0xFF4F46E5),
        onPrimary: const Color(0xFFFFFFFF),
        primaryContainer: const Color(0xFFEEF0FE),
        onPrimaryContainer: const Color(0xFF3730A3),
        surface: const Color(0xFFFFFFFF),
        onSurface: const Color(0xFF111117),
        onSurfaceVariant: const Color(0xFF55555F),
        surfaceContainerLowest: const Color(0xFFFFFFFF),
        surfaceContainerLow: const Color(0xFFF9F9FB),
        surfaceContainer: const Color(0xFFF4F4F6),
        surfaceContainerHigh: const Color(0xFFEFEFF3),
        surfaceContainerHighest: const Color(0xFFE9E9EE),
        outline: const Color(0xFFC7C7D1),
        outlineVariant: const Color(0xFFE4E4E9),
        error: const Color(0xFFDC2626),
        onError: const Color(0xFFFFFFFF),
        errorContainer: const Color(0xFFFEF2F2),
        onErrorContainer: const Color(0xFF991B1B),
      );
    }
    return ColorScheme.fromSeed(
      seedColor: AppColors.seedDark,
      brightness: Brightness.dark,
    ).copyWith(
      primary: const Color(0xFF818CF8),
      onPrimary: const Color(0xFF0A0A0F),
      primaryContainer: const Color(0xFF1E1B4B),
      onPrimaryContainer: const Color(0xFFC7D2FE),
      surface: const Color(0xFF14141B),
      onSurface: const Color(0xFFEDEDF2),
      onSurfaceVariant: const Color(0xFFA0A0AE),
      surfaceContainerLowest: const Color(0xFF0A0A0F),
      surfaceContainerLow: const Color(0xFF101016),
      surfaceContainer: const Color(0xFF1C1C26),
      surfaceContainerHigh: const Color(0xFF22222D),
      surfaceContainerHighest: const Color(0xFF2A2A36),
      outline: const Color(0xFF3A3A47),
      outlineVariant: const Color(0xFF26262F),
      error: const Color(0xFFF87171),
      onError: const Color(0xFF0A0A0F),
      errorContainer: const Color(0xFF300B0B),
      onErrorContainer: const Color(0xFFFCA5A5),
    );
  }

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = _scheme(brightness);
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
    );

    final text = base.textTheme
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface)
        .copyWith(
          headlineMedium: base.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
          headlineSmall: base.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
          titleLarge: base.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
          titleMedium: base.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
          titleSmall: base.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.35),
          labelLarge: base.textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        );

    OutlineInputBorder border(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(inputRadius),
          borderSide: BorderSide(color: color, width: width),
        );

    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(inputRadius),
    );

    return base.copyWith(
      scaffoldBackgroundColor: isDark
          ? const Color(0xFF0A0A0F)
          : const Color(0xFFFAFAFB),
      textTheme: text,
      extensions: <ThemeExtension<dynamic>>[
        isDark ? AppSemantic.dark : AppSemantic.light,
      ],
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        titleTextStyle: text.titleLarge,
        shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(64, 52)),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          ),
          shape: WidgetStatePropertyAll(buttonShape),
          textStyle: WidgetStatePropertyAll(text.labelLarge?.copyWith(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          )),
          elevation: const WidgetStatePropertyAll(0),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return scheme.surfaceContainerHighest;
            }
            if (states.contains(WidgetState.pressed)) {
              return Color.alphaBlend(
                  scheme.onPrimary.withValues(alpha: 0.12), scheme.primary);
            }
            return scheme.primary;
          }),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return scheme.onSurfaceVariant.withValues(alpha: 0.6);
            }
            return scheme.onPrimary;
          }),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(64, 52)),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          ),
          shape: WidgetStatePropertyAll(buttonShape),
          textStyle: WidgetStatePropertyAll(text.labelLarge?.copyWith(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          )),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return scheme.onSurface.withValues(alpha: 0.38);
            }
            return scheme.primary;
          }),
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return BorderSide(color: scheme.outlineVariant);
            }
            return BorderSide(color: scheme.outline);
          }),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(64, 48),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        isDense: false,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        constraints: const BoxConstraints(minHeight: 56),
        border: border(scheme.outlineVariant),
        enabledBorder: border(scheme.outlineVariant),
        disabledBorder: border(scheme.outlineVariant),
        focusedBorder: border(scheme.primary, 2),
        errorBorder: border(scheme.error),
        focusedErrorBorder: border(scheme.error, 2),
        hintStyle: TextStyle(color: scheme.onSurfaceVariant),
        labelStyle: TextStyle(color: scheme.onSurfaceVariant),
        errorStyle: TextStyle(color: scheme.error, fontSize: 12.5),
        prefixIconColor: scheme.onSurfaceVariant,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        selectedColor: scheme.primaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
        labelStyle: text.labelLarge?.copyWith(color: scheme.onSurface),
        secondaryLabelStyle:
            text.labelLarge?.copyWith(color: scheme.onPrimaryContainer),
        checkmarkColor: scheme.onPrimaryContainer,
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 6),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
              size: 24,
              color: states.contains(WidgetState.selected)
                  ? scheme.onPrimaryContainer
                  : scheme.onSurfaceVariant,
            )),
        labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
              fontSize: 12,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
              color: states.contains(WidgetState.selected)
                  ? scheme.primary
                  : scheme.onSurfaceVariant,
            )),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: scheme.primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        indicatorColor: scheme.primary,
        dividerColor: scheme.outlineVariant,
        indicatorSize: TabBarIndicatorSize.tab,
        labelStyle: text.labelLarge,
        unselectedLabelStyle:
            text.labelLarge?.copyWith(fontWeight: FontWeight.w500),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(inputRadius),
        ),
        contentTextStyle: text.bodyMedium?.copyWith(
          color: isDark ? scheme.onSurface : Colors.white,
          fontWeight: FontWeight.w500,
        ),
        backgroundColor:
            isDark ? scheme.surfaceContainerHighest : const Color(0xFF1F1F2B),
        actionTextColor: isDark ? scheme.primary : const Color(0xFFC7D2FE),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        titleTextStyle: text.titleLarge,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        space: 1,
        thickness: 1,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: scheme.onSurfaceVariant,
        minVerticalPadding: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(inputRadius),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.primaryContainer,
      ),
    );
  }
}
