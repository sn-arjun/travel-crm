import 'package:intl/intl.dart';

class NumberFormatter {
  NumberFormatter._();

  static final _compactFormat = NumberFormat.compact();
  static final _currencyFormat = NumberFormat.currency(symbol: '\u20B9', decimalDigits: 2);
  static final _compactCurrencyFormat = NumberFormat.compactCurrency(symbol: '\u20B9');
  static final _numberFormat = NumberFormat('#,##0.##');

  /// Formats a number in compact form (e.g. 1.2K, 3.4M).
  static String compact(double value) => _compactFormat.format(value);

  /// Formats a number as compact currency (e.g. ₹1.2K).
  static String compactCurrency(double value) => _compactCurrencyFormat.format(value);

  /// Formats a number as full currency (e.g. ₹12,345.00).
  static String formatCurrency(double value) => _currencyFormat.format(value);

  /// Formats a number with comma separators (e.g. 12,345.67).
  static String format(double? value) {
    if (value == null) return '-';
    return _numberFormat.format(value);
  }
}
