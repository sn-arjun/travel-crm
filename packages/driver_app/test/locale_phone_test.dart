import 'package:driver_app/core/constants/country_codes.dart';
import 'package:driver_app/core/utils/money.dart';
import 'package:driver_app/core/utils/phone.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared/shared.dart';

void main() {
  group('phones by country', () {
    test('UK, UAE, US and Singapore numbers normalise with their own code', () {
      expect(normalizePhone('07911 123456', defaultCountryCode: '+44'), '+447911123456');
      expect(normalizePhone('050 123 4567', defaultCountryCode: '+971'), '+971501234567');
      expect(normalizePhone('(415) 555-0132', defaultCountryCode: '+1'), '+14155550132');
      expect(normalizePhone('9123 4567', defaultCountryCode: '+65'), '+6591234567');
      expect(normalizePhone('6591234567', defaultCountryCode: '+65'), '+6591234567');
    });

    test('India is unchanged', () {
      expect(normalizePhone('09876543210'), '+919876543210');
      expect(normalizePhone('919876543210'), '+919876543210');
    });

    test('the sign-in field drops the trunk zero and checks the length per country', () {
      final gb = countryByIso('GB').phone;
      final inn = countryByIso('IN').phone;
      expect(composePhoneE164(gb, '07911 123456'), '+447911123456');
      expect(composePhoneE164(inn, '98201 44562'), '+919820144562');
      expect(isValidNational(gb, '07911123456'), isTrue);
      expect(isValidNational(inn, '98201'), isFalse);
      expect(isValidNational(countryByIso('SG').phone, '91234567'), isTrue);
    });

    test('display groups follow the country', () {
      expect(formatPhoneDisplay('+919820144562'), '+91 98201 44562');
      expect(formatPhoneDisplay('+447911123456'), '+44 7911 123456');
      expect(formatPhoneDisplay('+971501234567'), '+971 50 123 4567');
      expect(formatPhoneDisplay('+14155550132'), '+1 415 555 0132');
      expect(formatPhoneDisplay('+6591234567'), '+65 9123 4567');
      expect(formatPhoneDisplay('9820144562'), '9820144562');
    });

    test('nationalDigits reads any country code', () {
      expect(nationalDigits('+447911123456'), '7911123456');
      expect(nationalDigits('+971501234567'), '501234567');
    });
  });

  group('default country', () {
    test('the agency wins, then the device region, then India', () {
      expect(resolveDefaultCountry(agencyIso: 'AE', deviceIso: 'GB').iso, 'AE');
      expect(resolveDefaultCountry(deviceIso: 'gb').iso, 'GB');
      expect(resolveDefaultCountry(agencyIso: 'ZZ', deviceIso: '').iso, 'IN');
      expect(resolveDefaultCountry().iso, 'IN');
    });
  });

  group('agency money', () {
    test('shows each agency currency with its own grouping', () {
      expect(formatAgencyMoney(1250000, currency: 'INR', locale: 'en-IN'), '₹12,50,000');
      expect(formatAgencyMoney(1250000, currency: 'GBP', locale: 'en-GB'), '£1,250,000');
      expect(formatAgencyMoney(4500, currency: 'AED', locale: 'en-AE'), contains('4,500'));
      expect(formatAgencyMoney(4500, currency: 'AED', locale: 'en-AE'), contains('AED'));
      expect(formatAgencyMoney(99.5, currency: 'USD', locale: 'en-US', whole: false), '\$99.50');
    });

    test('with nothing stored it reads as INR', () {
      expect(formatAgencyMoney(4500), '₹4,500');
    });
  });
}
