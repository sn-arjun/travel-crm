import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

final offlineCacheManagerProvider = Provider<OfflineCacheManager>((ref) {
  return OfflineCacheManager();
});

class OfflineCacheManager {
  static const int maxLeads = 100;
  static const int maxContacts = 100;
  static const int maxTasks = 50;
  static const int maxRecentlyViewed = 20;
  static const int cacheExpiryDays = 7;

  static const String leadsBoxName = 'cache_leads';
  static const String contactsBoxName = 'cache_contacts';
  static const String tasksBoxName = 'cache_tasks';
  static const String pendingSyncBoxName = 'pending_sync';
  static const String recentlyViewedBoxName = 'recently_viewed';
  static const String dashboardCacheBoxName = 'cache_dashboard';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Future.wait([
      Hive.openBox(leadsBoxName),
      Hive.openBox(contactsBoxName),
      Hive.openBox(tasksBoxName),
      Hive.openBox(pendingSyncBoxName),
      Hive.openBox(recentlyViewedBoxName),
      Hive.openBox(dashboardCacheBoxName),
    ]);
  }

  Box get _leadsBox => Hive.box(leadsBoxName);
  Box get _contactsBox => Hive.box(contactsBoxName);
  Box get _tasksBox => Hive.box(tasksBoxName);
  Box get _pendingSyncBox => Hive.box(pendingSyncBoxName);
  Box get _recentlyViewedBox => Hive.box(recentlyViewedBoxName);
  Box get _dashboardBox => Hive.box(dashboardCacheBoxName);

  // --- Cache Entities ---

  Future<void> cacheLead(String id, Map<String, dynamic> data) async {
    data['_cached_at'] = DateTime.now().toIso8601String();
    await _leadsBox.put(id, data);
    await _evictOldest(_leadsBox, maxLeads);
    await _addRecentlyViewed('lead', id, data['title'] as String? ?? 'Lead');
  }

  Future<void> cacheContact(String id, Map<String, dynamic> data) async {
    data['_cached_at'] = DateTime.now().toIso8601String();
    await _contactsBox.put(id, data);
    await _evictOldest(_contactsBox, maxContacts);
    await _addRecentlyViewed('contact', id, data['name'] as String? ?? 'Contact');
  }

  Future<void> cacheTask(String id, Map<String, dynamic> data) async {
    data['_cached_at'] = DateTime.now().toIso8601String();
    await _tasksBox.put(id, data);
    await _evictOldest(_tasksBox, maxTasks);
  }

  Future<void> cacheDashboard(Map<String, dynamic> data) async {
    data['_cached_at'] = DateTime.now().toIso8601String();
    await _dashboardBox.put('stats', data);
  }

  // --- Read Cached ---

  Map<String, dynamic>? getCachedLead(String id) => _getCached(_leadsBox, id);
  Map<String, dynamic>? getCachedContact(String id) => _getCached(_contactsBox, id);
  Map<String, dynamic>? getCachedTask(String id) => _getCached(_tasksBox, id);
  Map<String, dynamic>? getCachedDashboard() => _getCached(_dashboardBox, 'stats');

  List<Map<String, dynamic>> getCachedLeads() => _getAllCached(_leadsBox);
  List<Map<String, dynamic>> getCachedContacts() => _getAllCached(_contactsBox);

  Map<String, dynamic>? _getCached(Box box, String key) {
    final data = box.get(key);
    if (data == null) return null;
    final cached = Map<String, dynamic>.from(data as Map);
    final cachedAt = cached['_cached_at'] as String?;
    if (cachedAt != null) {
      if (DateTime.now().difference(DateTime.parse(cachedAt)).inDays > cacheExpiryDays) {
        box.delete(key);
        return null;
      }
    }
    return cached;
  }

  List<Map<String, dynamic>> _getAllCached(Box box) {
    final results = <Map<String, dynamic>>[];
    for (final key in box.keys) {
      final data = _getCached(box, key as String);
      if (data != null) results.add(data);
    }
    return results;
  }

  // --- Recently Viewed ---

  Future<void> _addRecentlyViewed(String entityType, String id, String title) async {
    final list = List<Map<String, dynamic>>.from(
      _recentlyViewedBox.get('list', defaultValue: <Map<String, dynamic>>[]) as List,
    );

    // Remove existing entry if present
    list.removeWhere((e) => e['id'] == id && e['entity_type'] == entityType);

    // Add to front
    list.insert(0, {
      'entity_type': entityType,
      'id': id,
      'title': title,
      'viewed_at': DateTime.now().toIso8601String(),
    });

    // Limit size
    if (list.length > maxRecentlyViewed) {
      list.removeRange(maxRecentlyViewed, list.length);
    }

    await _recentlyViewedBox.put('list', list);
  }

  List<Map<String, dynamic>> getRecentlyViewed() {
    return List<Map<String, dynamic>>.from(
      _recentlyViewedBox.get('list', defaultValue: <Map<String, dynamic>>[]) as List,
    );
  }

  // --- Offline Action Queue ---

  Future<void> queueAction(
    String type,
    String entityType,
    String? entityId,
    Map<String, dynamic> payload,
  ) async {
    final queue = List<Map<String, dynamic>>.from(
      _pendingSyncBox.get('queue', defaultValue: <Map<String, dynamic>>[]) as List,
    );
    queue.add({
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'type': type,
      'entity_type': entityType,
      'entity_id': entityId,
      'payload': payload,
      'created_at': DateTime.now().toIso8601String(),
    });
    await _pendingSyncBox.put('queue', queue);
  }

  List<Map<String, dynamic>> getPendingActions() {
    return List<Map<String, dynamic>>.from(
      _pendingSyncBox.get('queue', defaultValue: <Map<String, dynamic>>[]) as List,
    );
  }

  int get pendingSyncCount => getPendingActions().length;

  Future<void> removeAction(String actionId) async {
    final queue = getPendingActions();
    queue.removeWhere((a) => a['id'] == actionId);
    await _pendingSyncBox.put('queue', queue);
  }

  Future<void> clearPendingActions() async {
    await _pendingSyncBox.put('queue', <Map<String, dynamic>>[]);
  }

  // --- LRU Eviction ---

  Future<void> _evictOldest(Box box, int maxSize) async {
    if (box.length <= maxSize) return;
    final entries = box.toMap().entries.toList()
      ..sort((a, b) {
        final aTime = (a.value as Map)['_cached_at'] as String? ?? '';
        final bTime = (b.value as Map)['_cached_at'] as String? ?? '';
        return aTime.compareTo(bTime);
      });
    final toRemove = entries.take(entries.length - maxSize);
    for (final entry in toRemove) {
      await box.delete(entry.key);
    }
  }

  // --- Cache Cleanup ---

  Future<void> clearExpired() async {
    for (final box in [_leadsBox, _contactsBox, _tasksBox]) {
      final keysToDelete = <dynamic>[];
      for (final key in box.keys) {
        final data = box.get(key);
        if (data is Map && data['_cached_at'] != null) {
          final cachedAt = DateTime.parse(data['_cached_at'] as String);
          if (DateTime.now().difference(cachedAt).inDays > cacheExpiryDays) {
            keysToDelete.add(key);
          }
        }
      }
      for (final key in keysToDelete) {
        await box.delete(key);
      }
    }
  }

  Future<void> clearAll() async {
    await _leadsBox.clear();
    await _contactsBox.clear();
    await _tasksBox.clear();
    await _pendingSyncBox.clear();
    await _recentlyViewedBox.clear();
    await _dashboardBox.clear();
  }
}
