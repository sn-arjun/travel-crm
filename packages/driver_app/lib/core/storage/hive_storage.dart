import 'package:hive_flutter/hive_flutter.dart';

class HiveStorage {
  HiveStorage._();

  static const String _authBox = 'driver_auth';
  static const String _tripsCacheBox = 'trips_cache';
  static const String _profileCacheBox = 'profile_cache';
  static const String _offlineQueueBox = 'offline_queue';
  static const String _settingsBox = 'driver_settings';
  static const String _checkinQueueBox = 'checkin_queue';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Future.wait([
      Hive.openBox(_authBox),
      Hive.openBox(_tripsCacheBox),
      Hive.openBox(_profileCacheBox),
      Hive.openBox(_offlineQueueBox),
      Hive.openBox(_settingsBox),
      Hive.openBox(_checkinQueueBox),
    ]);
  }

  // ── Auth ────────────────────────────────────────────────
  static Box get _auth => Hive.box(_authBox);

  static String? get accessToken => _auth.get('accessToken');
  static set accessToken(String? value) => _auth.put('accessToken', value);

  static String? get refreshToken => _auth.get('refreshToken');
  static set refreshToken(String? value) => _auth.put('refreshToken', value);

  static String? get driverId => _auth.get('driverId');
  static set driverId(String? value) => _auth.put('driverId', value);

  static String? get driverName => _auth.get('driverName');
  static set driverName(String? value) => _auth.put('driverName', value);

  static String? get driverPhone => _auth.get('driverPhone');
  static set driverPhone(String? value) => _auth.put('driverPhone', value);

  static String? get lastPhone => _auth.get('lastPhone');
  static set lastPhone(String? value) => _auth.put('lastPhone', value);

  static bool get isAuthenticated => accessToken != null;

  static Future<void> clearAuth() async {
    await _auth.clear();
  }

  // ── Agency (survives logout; cleared only by "Change agency") ──────
  static Box get _settings => Hive.box(_settingsBox);

  static String? get tenantId => _settings.get('tenantId');
  static String? get agencyName => _settings.get('agencyName');
  static String? get agencyCode => _settings.get('agencyCode');
  static String? get agencyLogoUrl => _settings.get('agencyLogoUrl');
  static bool get hasAgency => (tenantId ?? '').isNotEmpty;

  /// The agency's money and number conventions (R204): currency (INR, GBP...), number locale (en-IN), country and
  /// the country phone numbers typed without a country code are read in. Null until the app has seen them.
  static String? get agencyCurrency => _settings.get('agencyCurrency');
  static String? get agencyLocale => _settings.get('agencyLocale');
  static String? get agencyCountry => _settings.get('agencyCountry');
  static String? get agencyPhoneCountry => _settings.get('agencyPhoneCountry');

  static Future<void> saveAgencyLocale({
    String? currency,
    String? locale,
    String? country,
    String? phoneCountry,
  }) async {
    if (currency != null && currency.isNotEmpty) await _settings.put('agencyCurrency', currency);
    if (locale != null && locale.isNotEmpty) await _settings.put('agencyLocale', locale);
    if (country != null) await _settings.put('agencyCountry', country);
    if (phoneCountry != null && phoneCountry.isNotEmpty) {
      await _settings.put('agencyPhoneCountry', phoneCountry);
    }
  }

  static Future<void> saveAgency({
    required String tenantId,
    required String name,
    required String code,
    String? logoUrl,
    String? currency,
    String? locale,
    String? country,
    String? phoneCountry,
  }) async {
    await _settings.put('tenantId', tenantId);
    await _settings.put('agencyName', name);
    await _settings.put('agencyCode', code);
    await _settings.put('agencyLogoUrl', logoUrl);
    await _settings.delete('agencyCurrency');
    await _settings.delete('agencyLocale');
    await _settings.delete('agencyCountry');
    await _settings.delete('agencyPhoneCountry');
    await saveAgencyLocale(
      currency: currency,
      locale: locale,
      country: country,
      phoneCountry: phoneCountry,
    );
  }

  /// Signs out AND forgets the agency, cached trips and queued actions, so the
  /// next driver on this phone starts from the agency-code screen.
  static Future<void> clearAgency() async {
    await _auth.clear();
    for (final k in [
      'tenantId',
      'agencyName',
      'agencyCode',
      'agencyLogoUrl',
      'agencyCurrency',
      'agencyLocale',
      'agencyCountry',
      'agencyPhoneCountry',
    ]) {
      await _settings.delete(k);
    }
    await _tripsCache.clear();
    await Hive.box(_profileCacheBox).clear();
    await _offlineQueue.clear();
    await _settings.delete('crewRole');
    try {
      await _checkinQueue.clear();
    } catch (_) {
      // The box is opened at start up; only a bare test has none.
    }
  }

  // ── Crew role (cached from the profile, for the trip list badge) ──

  static String? get crewRole => _settings.get('crewRole') as String?;
  static set crewRole(String? value) => _settings.put('crewRole', value);

  // ── Settings ────────────────────────────────────────────

  static String get preferredNavApp =>
      _settings.get('preferredNavApp', defaultValue: 'google_maps');
  static set preferredNavApp(String value) =>
      _settings.put('preferredNavApp', value);

  static String get locale =>
      _settings.get('locale', defaultValue: 'en');
  static set locale(String value) =>
      _settings.put('locale', value);

  /// The language the driver picked in the app, or null when none was picked (the phone's language applies).
  static String? get chosenLocale => _settings.get('locale') as String?;

  // ── Trip Cache ──────────────────────────────────────────
  static Box get _tripsCache => Hive.box(_tripsCacheBox);

  static void cacheTrips(String tab, dynamic data) {
    _tripsCache.put('${tab}_data', data);
    _tripsCache.put('${tab}_timestamp', DateTime.now().toIso8601String());
  }

  static dynamic getCachedTrips(String tab) => _tripsCache.get('${tab}_data');

  static bool isTripCacheValid(String tab, {Duration maxAge = const Duration(hours: 1)}) {
    final ts = _tripsCache.get('${tab}_timestamp');
    if (ts == null) return false;
    final cached = DateTime.tryParse(ts);
    if (cached == null) return false;
    return DateTime.now().difference(cached) < maxAge;
  }

  /// The last trip detail the phone saw, with its stops and passengers, so a
  /// coach trip can be read (and ticked) without signal.
  static void cacheTripDetail(String tripId, Map<String, dynamic> trip) {
    _tripsCache.put('detail_$tripId', trip);
  }

  static dynamic getCachedTripDetail(String tripId) =>
      _tripsCache.get('detail_$tripId');

  // ── Check-in queue (stop and passenger ticks made offline) ──
  static Box get _checkinQueue => Hive.box(_checkinQueueBox);

  /// Appends an op; keys grow in order, so the queue is first in, first out.
  static Future<int> addCheckin(Map<String, dynamic> op) =>
      _checkinQueue.add(op);

  static List<MapEntry<dynamic, Map<String, dynamic>>> pendingCheckins() {
    final keys = _checkinQueue.keys.toList()
      ..sort((a, b) => (a as int).compareTo(b as int));
    return [
      for (final k in keys)
        if (_checkinQueue.get(k) is Map)
          MapEntry(k, Map<String, dynamic>.from(_checkinQueue.get(k) as Map)),
    ];
  }

  static Future<void> updateCheckin(dynamic key, Map<String, dynamic> op) =>
      _checkinQueue.put(key, op);

  static Future<void> removeCheckin(dynamic key) => _checkinQueue.delete(key);

  // ── Offline Queue ───────────────────────────────────────
  static Box get _offlineQueue => Hive.box(_offlineQueueBox);

  static Future<void> enqueueAction(Map<String, dynamic> action) async {
    final key = DateTime.now().millisecondsSinceEpoch.toString();
    await _offlineQueue.put(key, action);
  }

  static List<MapEntry<dynamic, dynamic>> getPendingActions() {
    return _offlineQueue.toMap().entries.toList()
      ..sort((a, b) => a.key.toString().compareTo(b.key.toString()));
  }

  static Future<void> removeAction(String key) async {
    await _offlineQueue.delete(key);
  }

  static Future<void> clearOfflineQueue() async {
    await _offlineQueue.clear();
  }
}
