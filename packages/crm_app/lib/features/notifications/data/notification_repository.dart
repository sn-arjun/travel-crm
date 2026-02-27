import 'package:shared/shared.dart';

class NotificationRepository {
  final ApiClient _apiClient;

  NotificationRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── Notification Fetching ────────────────────────────────────────

  Future<Map<String, dynamic>> getNotifications({
    int page = 1,
    int limit = 20,
    bool unreadOnly = false,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (unreadOnly) 'unread_only': true,
    };

    final response = await _apiClient.get(
      ApiEndpoints.notifications,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  Future<int> getUnreadCount() async {
    final response = await _apiClient.get(
      ApiEndpoints.notifications,
      queryParameters: {'count': 'true'},
    );
    final data = response.data['data'] as Map<String, dynamic>;
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  Future<Map<String, dynamic>> getNotificationById(String id) async {
    final response = await _apiClient.get(ApiEndpoints.notification(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Notification Actions ──────────────────────────────────────────

  Future<void> markAsRead(String id) async {
    await _apiClient.put(ApiEndpoints.notificationRead(id));
  }

  Future<void> markAllAsRead() async {
    await _apiClient.put(ApiEndpoints.notificationsReadAll);
  }

  Future<void> deleteNotification(String id) async {
    await _apiClient.delete(ApiEndpoints.notification(id));
  }

  // ── Push Token Management ─────────────────────────────────────────

  Future<void> registerPushToken({
    required String token,
    required String deviceType,
    required String deviceName,
  }) async {
    await _apiClient.post(
      ApiEndpoints.pushTokens,
      data: {
        'token': token,
        'device_type': deviceType,
        'device_name': deviceName,
      },
    );
  }

  Future<void> deregisterPushToken(String token) async {
    await _apiClient.delete(
      ApiEndpoints.pushToken(token),
    );
  }

  // ── Notification Preferences ─────────────────────────────────────

  Future<Map<String, dynamic>> getNotificationPreferences() async {
    final response = await _apiClient.get(ApiEndpoints.notificationPreferences);
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateNotificationPreferences(
    Map<String, dynamic> preferences,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.notificationPreferences,
      data: preferences,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Badge Counts ──────────────────────────────────────────────────

  Future<Map<String, dynamic>> getBadgeCounts() async {
    final response = await _apiClient.get(ApiEndpoints.notificationBadgeCounts);
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Admin Functions ───────────────────────────────────────────────

  Future<Map<String, dynamic>> sendAnnouncement({
    required String title,
    required String body,
    required String target,
    String? targetRole,
    List<String>? targetUserIds,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.notificationAnnounce,
      data: {
        'title': title,
        'body': body,
        'target': target,
        'target_role': ?targetRole,
        'target_user_ids': ?targetUserIds,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }
}
