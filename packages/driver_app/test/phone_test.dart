import 'package:driver_app/core/utils/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('normalizePhone', () {
    test('prefixes the default +91 to a 10 digit number', () {
      expect(normalizePhone('9876543210'), '+919876543210');
    });

    test('strips spaces, dashes, dots and parentheses', () {
      expect(normalizePhone('(98765) 432-10'), '+919876543210');
      expect(normalizePhone('98765.43210'), '+919876543210');
    });

    test('drops a leading national zero', () {
      expect(normalizePhone('09876543210'), '+919876543210');
    });

    test('uses the selected country code', () {
      expect(normalizePhone('501234567', defaultCountryCode: '+971'),
          '+971501234567');
      expect(normalizePhone('5012345678', defaultCountryCode: '1'),
          '+15012345678');
    });

    test('keeps an existing E.164 number unchanged', () {
      expect(normalizePhone('+919876543210'), '+919876543210');
      expect(normalizePhone('+91 98765 43210'), '+919876543210');
    });

    test('converts a 00 international prefix', () {
      expect(normalizePhone('00919876543210'), '+919876543210');
    });

    test('treats a long number without + as already carrying a country code',
        () {
      expect(normalizePhone('919876543210'), '+919876543210');
    });

    test('is idempotent', () {
      final once = normalizePhone('98765 43210');
      expect(normalizePhone(once), once);
    });

    test('returns an empty string for empty input', () {
      expect(normalizePhone('  '), '');
    });
  });

  group('nationalDigits', () {
    test('returns the last 10 digits of an E.164 number', () {
      expect(nationalDigits('+919876543210'), '9876543210');
    });

    test('leaves a short number alone', () {
      expect(nationalDigits('98765'), '98765');
    });
  });
}
