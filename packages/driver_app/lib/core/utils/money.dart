import 'package:shared/shared.dart';

import '../storage/hive_storage.dart';

/// Shows an amount in the agency's currency (R204): the currency and number
/// locale the agency sent at sign-in. [currency] and [locale] override the
/// stored values (used by tests and by screens that already know them). An
/// agency whose settings have not reached the app yet reads as INR with Indian
/// grouping, as before.
String formatAgencyMoney(num amount, {String? currency, String? locale, bool whole = true}) {
  String? storedCurrency;
  String? storedLocale;
  try {
    storedCurrency = HiveStorage.agencyCurrency;
    storedLocale = HiveStorage.agencyLocale;
  } catch (_) {
    // storage not open (tests, first frame): fall back to the defaults below
  }
  final code = (currency ?? storedCurrency ?? 'INR').toUpperCase();
  return CurrencyUtils.format(
    amount.toDouble(),
    currency: code,
    locale: locale ?? storedLocale,
    decimalDigits: whole ? 0 : null,
  );
}
