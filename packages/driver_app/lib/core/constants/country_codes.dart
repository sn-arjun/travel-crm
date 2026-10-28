import 'package:shared/shared.dart';

export 'package:shared/shared.dart' show kDefaultCountryIso;

/// Dial codes for the phone field on the sign-in screen: every country and
/// territory with its own international calling code. The table itself lives
/// in packages/shared (generated from the same source list as the backend and
/// the desktop app); this wrapper keeps the sign-in screen's small API.
class Country {
  final PhoneCountry phone;

  const Country(this.phone);

  String get name => phone.name;
  String get iso => phone.iso;

  /// Dial code with the leading +.
  String get dial => phone.dial;

  int get minLength => phone.minLength;
  int get maxLength => phone.maxLength;

  /// Flag emoji built from the ISO 3166 alpha-2 code.
  String get flag => phone.flag;

  @override
  String toString() => '$name ($dial)';
}

/// Every country, the launch markets first.
final List<Country> kCountries = [for (final c in kPhoneCountries) Country(c)];

Country countryByIso(String iso) {
  final wanted = iso.trim().toUpperCase();
  return kCountries.firstWhere(
    (c) => c.iso == wanted,
    orElse: () => kCountries.firstWhere((c) => c.iso == kDefaultCountryIso),
  );
}

/// The country the sign-in screen starts on: the agency's phone country, else
/// the phone's own region, else the launch market.
Country resolveDefaultCountry({String? agencyIso, String? deviceIso}) {
  for (final iso in [agencyIso, deviceIso]) {
    final code = (iso ?? '').trim().toUpperCase();
    if (code.isEmpty) continue;
    for (final c in kCountries) {
      if (c.iso == code) return c;
    }
  }
  return countryByIso(kDefaultCountryIso);
}

/// Splits an E.164 number into its country and national digits using the
/// longest matching dial code. Returns null when no dial code matches.
({Country country, String national})? splitE164(String? phone) {
  if (phone == null) return null;
  final value = phone.trim();
  if (!value.startsWith('+')) return null;
  final split = splitPhoneE164(value);
  if (split == null) return null;
  return (country: countryByIso(split.country.iso), national: split.national);
}

/// Case-insensitive match on country name, ISO code or dial code.
List<Country> searchCountries(String query) {
  final q = query.trim().toLowerCase().replaceFirst(RegExp(r'^\+'), '');
  if (q.isEmpty) return kCountries;
  return kCountries
      .where((c) =>
          c.name.toLowerCase().contains(q) ||
          c.iso.toLowerCase() == q ||
          c.dial.substring(1).startsWith(q))
      .toList();
}
