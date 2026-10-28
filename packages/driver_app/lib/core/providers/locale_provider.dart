import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/hive_storage.dart';

/// The language the driver picked in Profile. Null until one is picked: the app then follows the phone's language.
final localeProvider = StateProvider<Locale?>((ref) {
  try {
    final chosen = HiveStorage.chosenLocale;
    if (chosen == null || chosen.isEmpty) return null;
    return Locale(chosen);
  } catch (_) {
    // storage not open (tests, first frame): follow the phone
    return null;
  }
});
