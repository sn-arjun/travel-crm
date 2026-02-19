import 'package:intl/intl.dart';

class CurrencyUtils {
  CurrencyUtils._();

  static final Map<String, NumberFormat> _formatters = {};

  static NumberFormat _getFormatter(String currency, {String? locale}) {
    final key = '${currency}_${locale ?? 'default'}';
    return _formatters.putIfAbsent(key, () {
      switch (currency) {
        case 'INR':
          return NumberFormat.currency(locale: 'en_IN', symbol: '\u20B9', decimalDigits: 2);
        case 'USD':
          return NumberFormat.currency(locale: 'en_US', symbol: '\$', decimalDigits: 2);
        case 'EUR':
          return NumberFormat.currency(locale: 'de_DE', symbol: '\u20AC', decimalDigits: 2);
        case 'GBP':
          return NumberFormat.currency(locale: 'en_GB', symbol: '\u00A3', decimalDigits: 2);
        case 'AED':
          return NumberFormat.currency(locale: 'ar_AE', symbol: 'AED ', decimalDigits: 2);
        default:
          return NumberFormat.currency(name: currency, decimalDigits: 2);
      }
    });
  }

  /// Format amount with currency symbol: ₹1,00,000.00
  static String format(double amount, {String currency = 'INR', String? locale}) {
    return _getFormatter(currency, locale: locale).format(amount);
  }

  /// Format amount without symbol: 1,00,000.00
  static String formatAmount(double amount, {String currency = 'INR'}) {
    final formatter = NumberFormat('#,##,##0.00', currency == 'INR' ? 'en_IN' : 'en_US');
    return formatter.format(amount);
  }

  /// Format compact: ₹1L, ₹50K
  static String formatCompact(double amount, {String currency = 'INR'}) {
    if (amount >= 10000000) return '${_getFormatter(currency).currencySymbol}${(amount / 10000000).toStringAsFixed(1)}Cr';
    if (amount >= 100000) return '${_getFormatter(currency).currencySymbol}${(amount / 100000).toStringAsFixed(1)}L';
    if (amount >= 1000) return '${_getFormatter(currency).currencySymbol}${(amount / 1000).toStringAsFixed(1)}K';
    return format(amount, currency: currency);
  }
}
