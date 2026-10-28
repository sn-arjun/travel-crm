import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  group('CurrencyUtils.format', () {
    test('INR uses lakh and crore grouping', () {
      expect(CurrencyUtils.format(100000.5, currency: 'INR', locale: 'en-IN'), '₹1,00,000.50');
      expect(CurrencyUtils.format(12345678, currency: 'INR', locale: 'en_IN'), '₹1,23,45,678.00');
    });

    test('INR with no locale still reads as en_IN (the legacy behaviour)', () {
      expect(CurrencyUtils.format(100000.5), '₹1,00,000.50');
    });

    test('GBP groups in thousands with the pound sign', () {
      expect(CurrencyUtils.format(100000.5, currency: 'GBP', locale: 'en-GB'), '£100,000.50');
      expect(CurrencyUtils.format(1234.5, currency: 'GBP'), '£1,234.50');
    });

    test('AED shows the dirham code and groups in thousands', () {
      final text = CurrencyUtils.format(1234567.891, currency: 'AED', locale: 'en-AE');
      expect(text, contains('AED'));
      expect(text, contains('1,234,567.89'));
    });

    test('USD and EUR keep their symbols', () {
      expect(CurrencyUtils.format(1000, currency: 'USD', locale: 'en-US'), '\$1,000.00');
      expect(CurrencyUtils.format(1000, currency: 'EUR', locale: 'en-US'), contains('€'));
    });

    test('lakh grouping is only for en_IN: INR amounts in en_US group in thousands', () {
      expect(CurrencyUtils.format(100000, currency: 'INR', locale: 'en-US'), '₹100,000.00');
    });

    test('whole amounts drop the decimals', () {
      expect(CurrencyUtils.format(4500, currency: 'INR', locale: 'en-IN', decimalDigits: 0), '₹4,500');
      expect(CurrencyUtils.format(4500, currency: 'GBP', locale: 'en-GB', decimalDigits: 0), '£4,500');
    });

    test('an unknown locale never throws', () {
      expect(CurrencyUtils.format(1000, currency: 'GBP', locale: 'zz-ZZ'), contains('1,000'));
    });
  });

  group('CurrencyUtils.formatAmount', () {
    test('no symbol, locale grouping', () {
      expect(CurrencyUtils.formatAmount(100000, currency: 'INR', locale: 'en-IN'), '1,00,000.00');
      expect(CurrencyUtils.formatAmount(100000, currency: 'GBP', locale: 'en-GB'), '100,000.00');
    });
  });

  group('CurrencyUtils.formatCompact', () {
    test('en_IN reads K, L and Cr', () {
      expect(CurrencyUtils.formatCompact(5000.0), '₹5.0K');
      expect(CurrencyUtils.formatCompact(500000.0), '₹5.0L');
      expect(CurrencyUtils.formatCompact(10000000.0), '₹1.0Cr');
    });

    test('every other locale reads K, M and B, never L or Cr', () {
      expect(CurrencyUtils.formatCompact(500000.0, currency: 'GBP', locale: 'en-GB'), '£500.0K');
      expect(CurrencyUtils.formatCompact(2500000.0, currency: 'GBP', locale: 'en-GB'), '£2.5M');
      expect(CurrencyUtils.formatCompact(10000000.0, currency: 'USD', locale: 'en-US'), '\$10.0M');
    });
  });
}
