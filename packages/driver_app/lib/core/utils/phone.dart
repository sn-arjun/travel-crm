import 'package:shared/shared.dart';

/// Normalises a phone number typed by a driver into E.164 form (`+919876543210`).
///
/// Rules:
/// * spaces, dashes, dots and parentheses are stripped;
/// * a leading `+` is kept and the number is treated as already international;
/// * a leading `00` is treated as `+`;
/// * a single national trunk `0` is dropped (07911 123456 becomes +447911123456);
/// * digits that already start with the country's calling code and are too long to be national keep it;
/// * otherwise [defaultCountryCode] (the agency's dial code, `+31` for a Dutch agency) is prefixed;
/// * a longer number that fits no country rule is assumed to already include its country code.
///
/// There is no default country: the caller passes the dial code of the agency the driver belongs to.
String normalizePhone(String raw, {required String defaultCountryCode}) {
  var value = raw.trim().replaceAll(RegExp(r'[\s\-().]'), '');
  if (value.isEmpty) return value;

  if (value.startsWith('+')) {
    return '+${value.substring(1).replaceAll(RegExp(r'\D'), '')}';
  }

  value = value.replaceAll(RegExp(r'\D'), '');
  if (value.startsWith('00')) {
    return '+${value.substring(2)}';
  }

  final codeDigits = defaultCountryCode.replaceAll(RegExp(r'\D'), '');
  PhoneCountry? country;
  for (final c in kPhoneCountries) {
    if (c.dialDigits == codeDigits) {
      country = c;
      break;
    }
  }

  if (country != null) {
    if (value.startsWith(codeDigits)) {
      final rest = value.length - codeDigits.length;
      final wide = country.maxLength - country.minLength >= 3;
      final fits = rest >= country.minLength && rest <= country.maxLength;
      // wide ranges (Singapore 8-11, Germany 6-13): digits that fit the code plus the shortest number keep the code
      if (fits &&
          (value.length > country.maxLength ||
              (wide && (value.length >= 11 || (rest == country.minLength && value.length >= 10))))) {
        return '+$value';
      }
    }
    if (isValidNational(country, value)) return composePhoneE164(country, value);
  }

  if (value.startsWith('0')) value = value.substring(1);
  if (value.length > 10) return '+$value';
  return '+$codeDigits$value';
}

/// Returns the national digits to show in the phone field for a stored
/// number: the digits after the country code when the number carries one,
/// otherwise the digits as they are.
String nationalDigits(String phone) {
  final trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    final split = splitPhoneE164(trimmed);
    if (split != null) return split.national;
  }
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
}

/// How a country's national numbers are grouped for display, by length.
const Map<String, Map<int, List<int>>> _groups = {
  'IN': {10: [5, 5]},
  'US': {10: [3, 3, 4]},
  'CA': {10: [3, 3, 4]},
  'GB': {10: [4, 6]},
  'AE': {9: [2, 3, 4]},
  'SG': {8: [4, 4]},
  'AU': {9: [3, 3, 3]},
};

/// Formats a stored phone number for display only (never for dialling).
///
/// `+919820144562` becomes `+91 98201 44562`, `+14155550132` becomes
/// `+1 415 555 0132`, `+447911123456` becomes `+44 7911 123456` and
/// `+971501234567` becomes `+971 50 123 4567`. A number without a recognised
/// country code is shown exactly as stored.
String formatPhoneDisplay(String phone) {
  final raw = phone.trim();
  if (!raw.startsWith('+')) return raw;
  final compact = raw.replaceAll(RegExp(r'[\s\-().]'), '');
  if (!RegExp(r'^\+\d+$').hasMatch(compact)) return raw;
  final split = splitPhoneE164(compact);
  if (split == null) return raw;
  final c = split.country;
  final table = _groups[c.iso] ?? (c.dialDigits == '1' ? _groups['US'] : null);
  final sizes = table?[split.national.length];
  if (sizes == null) return raw;
  final parts = <String>[];
  var at = 0;
  for (final size in sizes) {
    parts.add(split.national.substring(at, at + size));
    at += size;
  }
  return '${c.dial} ${parts.join(' ')}';
}
