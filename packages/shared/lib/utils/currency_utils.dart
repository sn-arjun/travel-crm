import 'package:intl/intl.dart';

/// Money formatting in the agency's currency (R204).
///
/// Amounts are shown with the agency's own currency and the number conventions of its locale (the `en-IN`
/// style tag the API returns; `en_IN` works too). Lakh/crore grouping appears only for `en_IN`; every other
/// locale groups in thousands. With no locale, INR reads as `en_IN`, GBP as `en_GB` and the rest as `en_US`.
class CurrencyUtils {
  CurrencyUtils._();

  static final Map<String, NumberFormat> _formatters = {};
  static final Map<String, NumberFormat> _plainFormatters = {};
  static final RegExp _lettersOnly = RegExp(r'^[A-Za-z]+$');

  /// The intl locale to use: the given tag normalised to `xx_YY`, else a default from the currency.
  static String resolveLocale(String currency, String? locale) {
    final tag = (locale ?? '').trim().replaceAll('-', '_');
    if (tag.isNotEmpty) return tag;
    switch (currency.toUpperCase()) {
      case 'INR':
        return 'en_IN';
      case 'GBP':
        return 'en_GB';
      default:
        return 'en_US';
    }
  }

  /// Tries the full tag, then its language, then en_US, so an unknown locale never throws.
  static NumberFormat _build(String locale, NumberFormat Function(String) make) {
    final candidates = <String>[locale, locale.split('_').first, 'en_US'];
    for (final candidate in candidates) {
      try {
        return make(candidate);
      } catch (_) {
        // try the next candidate
      }
    }
    return make('en_US');
  }

  static NumberFormat _getFormatter(String currency, {String? locale, int? decimalDigits}) {
    final code = currency.toUpperCase();
    final resolved = resolveLocale(code, locale);
    final key = '${code}_${resolved}_${decimalDigits ?? 'default'}';
    return _formatters.putIfAbsent(
      key,
      () => _build(resolved, (l) {
        final simple = NumberFormat.simpleCurrency(locale: l, name: code, decimalDigits: decimalDigits);
        // A currency whose symbol is only letters (AED, CHF, SAR) reads "AED 1,000.00": the ISO code, then a
        // no-break space. intl would otherwise print its short local form ("dh1,000.00" for the dirham).
        final symbol = code == 'AED' ? 'AED' : simple.currencySymbol;
        if (!_lettersOnly.hasMatch(symbol)) return simple;
        return NumberFormat.currency(
          locale: l,
          name: code,
          symbol: '$symbol ',
          decimalDigits: decimalDigits ?? simple.decimalDigits,
        );
      }),
    );
  }

  /// Format amount with the currency symbol: ₹1,00,000.00 (en_IN), £1,000.00 (en_GB), $1,000.00 (en_US).
  static String format(
    double amount, {
    String currency = 'INR',
    String? locale,
    int? decimalDigits,
  }) {
    return _getFormatter(currency, locale: locale, decimalDigits: decimalDigits).format(amount);
  }

  /// Format amount without a symbol: 1,00,000.00 for en_IN, 1,000.00 elsewhere.
  static String formatAmount(double amount, {String currency = 'INR', String? locale}) {
    final resolved = resolveLocale(currency, locale);
    final formatter = _plainFormatters.putIfAbsent(
      resolved,
      () => _build(resolved, (l) => NumberFormat.decimalPatternDigits(locale: l, decimalDigits: 2)),
    );
    return formatter.format(amount);
  }

  /// Format compact: ₹1L, ₹1Cr for en_IN; $5.0K, $1.0M, $2.0B for every other locale.
  static String formatCompact(double amount, {String currency = 'INR', String? locale}) {
    final resolved = resolveLocale(currency, locale);
    final symbol = _getFormatter(currency, locale: locale).currencySymbol;
    final abs = amount.abs();
    final sign = amount < 0 ? '-' : '';
    String scaled(double divisor, String suffix) =>
        '$sign$symbol${(abs / divisor).toStringAsFixed(1)}$suffix';

    if (resolved == 'en_IN') {
      if (abs >= 10000000) return scaled(10000000, 'Cr');
      if (abs >= 100000) return scaled(100000, 'L');
      if (abs >= 1000) return scaled(1000, 'K');
    } else {
      if (abs >= 1000000000) return scaled(1000000000, 'B');
      if (abs >= 1000000) return scaled(1000000, 'M');
      if (abs >= 1000) return scaled(1000, 'K');
    }
    return format(amount, currency: currency, locale: locale);
  }
}
