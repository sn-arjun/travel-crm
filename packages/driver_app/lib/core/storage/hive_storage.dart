import 'package:hive_flutter/hive_flutter.dart';

class HiveStorage {
  HiveStorage._();

  static const String _authBox = 'driver_auth';
  static const String _tripsCacheBox = 'trips_cache';
  static const String _profileCacheBox = 'profile_cache';
  static const String _offlineQueueBox = 'offline_queue';
  static const String _settingsBox = 'driver_settings';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Future.wait([
      Hive.openBox(_authBox),
      Hive.openBox(_tripsCacheBox),
      Hive.openBox(_profileCacheBox),
      Hive.openBox(_offlineQueueBox),
      Hive.openBox(_settingsBox),
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

  // ── Settings ────────────────────────────────────────────
  static Box get _settings => Hive.box(_settingsBox);

  static String get preferredNavApp =>
      _settings.get('preferredNavApp', defaultValue: 'google_maps');
  static set preferredNavApp(String value) =>
      _settings.put('preferredNavApp', value);

  static String get locale =>
      _settings.get('locale', defaultValue: 'en');
  static set locale(String value) =>
      _settings.put('locale', value);

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
