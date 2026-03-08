import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  return LocaleNotifier();
});

class LocaleNotifier extends StateNotifier<Locale> {
  static const String _boxName = 'app_settings';
  static const String _key = 'locale';

  LocaleNotifier() : super(_loadSavedLocale());

  static Locale _loadSavedLocale() {
    try {
      final box = Hive.box(_boxName);
      final saved = box.get(_key) as String?;
      if (saved != null) {
        return Locale(saved);
      }
    } catch (_) {}
    // Default to device locale or English
    final deviceLocale = PlatformDispatcher.instance.locale;
    return Locale(deviceLocale.languageCode);
  }

  static Future<void> init() async {
    await Hive.openBox(_boxName);
  }

  void setLocale(Locale locale) {
    state = locale;
    Hive.box(_boxName).put(_key, locale.languageCode);
  }

  static const supportedLocales = [
    Locale('en'),
    Locale('hi'),
  ];

  static const localeNames = {
    'en': 'English',
    'hi': 'हिन्दी (Hindi)',
  };
}
