import 'package:intl/intl.dart';
import 'package:shared/shared.dart';

import '../storage/hive_storage.dart';

/// Shows an amount in the agency's currency (R204): the currency and number
/// locale the agency sent at sign-in. [currency] and [locale] are the server's
/// values for the record on screen and win over the stored agency values.
/// With no currency known at all (an agency whose settings have not reached the
/// app yet) the amount is shown as a plain number in the stored locale: the app
/// never guesses a currency.
String formatAgencyMoney(num amount, {String? currency, String? locale, bool whole = true}) {
  String? storedCurrency;
  String? storedLocale;
  try {
    storedCurrency = HiveStorage.agencyCurrency;
    storedLocale = HiveStorage.agencyLocale;
  } catch (_) {
    // storage not open (tests, first frame): fall back to the defaults below
  }
  final known = (currency != null && currency.isNotEmpty) ? currency : storedCurrency;
  if (known == null || known.isEmpty) {
    final pattern = NumberFormat.decimalPatternDigits(
      locale: locale ?? storedLocale,
      decimalDigits: whole ? 0 : null,
    );
    return pattern.format(amount);
  }
  final code = known.toUpperCase();
  return CurrencyUtils.format(
    amount.toDouble(),
    currency: code,
    locale: locale ?? storedLocale,
    decimalDigits: whole ? 0 : null,
  );
}
