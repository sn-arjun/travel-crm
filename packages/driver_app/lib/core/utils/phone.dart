/// Normalises a phone number typed by a driver into E.164 form (`+919876543210`).
///
/// Rules:
/// * spaces, dashes, dots and parentheses are stripped;
/// * a leading `+` is kept and the number is treated as already international;
/// * a leading `00` is treated as `+`;
/// * a single national trunk `0` is dropped;
/// * a number of 10 digits or fewer gets [defaultCountryCode] prefixed;
/// * a longer number is assumed to already include its country code.
String normalizePhone(String raw, {String defaultCountryCode = '+91'}) {
  var value = raw.trim().replaceAll(RegExp(r'[\s\-().]'), '');
  if (value.isEmpty) return value;

  if (value.startsWith('+')) {
    return '+${value.substring(1).replaceAll(RegExp(r'\D'), '')}';
  }

  value = value.replaceAll(RegExp(r'\D'), '');
  if (value.startsWith('00')) {
    return '+${value.substring(2)}';
  }
  if (value.startsWith('0')) {
    value = value.substring(1);
  }

  final code = defaultCountryCode.startsWith('+')
      ? defaultCountryCode
      : '+$defaultCountryCode';
  if (value.length > 10) return '+$value';
  return '$code$value';
}

/// Returns the national digits to show in the phone field for a stored
/// number (the last 10 digits when the number carries a country code).
String nationalDigits(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
}
