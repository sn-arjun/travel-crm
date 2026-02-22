import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'notification_repository.dart';
import 'notification_state.dart';

// ── Repository Provider ──────────────────────────────────────────────

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Notification List Provider ───────────────────────────────────────

final notificationListProvider =
    StateNotifierProvider<NotificationListNotifier, NotificationListState>(
  (ref) => NotificationListNotifier(
    repository: ref.read(notificationRepositoryProvider),
  ),
);

class NotificationListNotifier extends StateNotifier<NotificationListState> {
  final NotificationRepository _repository;

  NotificationListNotifier({required NotificationRepository repository})
      : _repository = repository,
        super(const NotificationListState());

  Future<void> loadNotifications({bool refresh = false}) async {
    if (state.status == NotificationListStatus.loading) return;

    state = state.copyWith(
      status: NotificationListStatus.loading,
      notifications: refresh ? [] : state.notifications,
    );

    try {
      final response = await _repository.getNotifications(
        page: 1,
        limit: 20,
        unreadOnly: state.unreadOnly,
      );

      final notifications = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: NotificationListStatus.loaded,
        notifications: notifications,
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: NotificationListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == NotificationListStatus.loading) {
      return;
    }

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: NotificationListStatus.loading);

    try {
      final response = await _repository.getNotifications(
        page: nextPage,
        limit: 20,
        unreadOnly: state.unreadOnly,
      );

      final notifications = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: NotificationListStatus.loaded,
        notifications: [...state.notifications, ...notifications],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: NotificationListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> markAsRead(String id) async {
    try {
      await _repository.markAsRead(id);
      final idx = state.notifications.indexWhere((n) => n['id'] == id);
      if (idx != -1) {
        final updated = [...state.notifications];
        updated[idx] = {
          ...updated[idx],
          'is_read': 1,
        };
        state = state.copyWith(notifications: updated);
      }
    } catch (_) {}
  }

  Future<void> markAllAsRead() async {
    try {
      await _repository.markAllAsRead();
      final updated = state.notifications.map((n) {
        return {...n, 'is_read': 1};
      }).toList();
      state = state.copyWith(notifications: updated);
    } catch (_) {}
  }

  Future<void> deleteNotification(String id) async {
    try {
      await _repository.deleteNotification(id);
      final updated = state.notifications
          .where((n) => n['id'] != id)
          .toList();
      state = state.copyWith(notifications: updated);
    } catch (_) {}
  }

  void toggleUnreadOnly(bool unreadOnly) {
    state = state.copyWith(unreadOnly: unreadOnly);
  }

  String _extractError(dynamic error) {
    if (error is DioException) {
      return error.response?.data['message'] ?? 'Failed to load notifications';
    }
    return 'Failed to load notifications';
  }
}

// ── Unread Count Provider (Polling) ──────────────────────────────────

final unreadCountProvider = StreamProvider.autoDispose<int>((ref) async* {
  final repository = ref.watch(notificationRepositoryProvider);

  // Initial load
  try {
    final count = await repository.getUnreadCount();
    yield count;
  } catch (_) {
    yield 0;
  }

  // Poll every 2 minutes
  while (true) {
    await Future.delayed(const Duration(minutes: 2));
    try {
      final count = await repository.getUnreadCount();
      yield count;
    } catch (_) {
      // Keep the last value on error
    }
  }
});

// ── Notification Preferences Provider ────────────────────────────────

final notificationPreferencesProvider = StateNotifierProvider<
    NotificationPreferencesNotifier,
    NotificationPreferencesState>(
  (ref) => NotificationPreferencesNotifier(
    repository: ref.read(notificationRepositoryProvider),
  ),
);

class NotificationPreferencesNotifier
    extends StateNotifier<NotificationPreferencesState> {
  final NotificationRepository _repository;

  NotificationPreferencesNotifier({required NotificationRepository repository})
      : _repository = repository,
        super(const NotificationPreferencesState());

  Future<void> loadPreferences() async {
    state = state.copyWith(isLoading: true);
    try {
      final prefs = await _repository.getNotificationPreferences();

      // Parse mute_all
      final muteAll = prefs['mute_all'] as bool? ?? false;

      // Parse preferences grid
      final prefsMap = <String, Map<String, bool>>{};
      if (prefs['preferences'] is Map) {
        final p = prefs['preferences'] as Map<String, dynamic>;
        p.forEach((type, channels) {
          if (channels is Map) {
            prefsMap[type] = (channels as Map<String, dynamic>).map(
              (k, v) => MapEntry(k, v as bool),
            );
          }
        });
      }

      // Parse quiet hours
      TimeOfDay? start, end;
      String? timezone;
      if (prefs['quiet_hours_start'] is String) {
        final parts = (prefs['quiet_hours_start'] as String).split(':');
        if (parts.length == 2) {
          start = TimeOfDay(
            hour: int.tryParse(parts[0]) ?? 22,
            minute: int.tryParse(parts[1]) ?? 0,
          );
        }
      }
      if (prefs['quiet_hours_end'] is String) {
        final parts = (prefs['quiet_hours_end'] as String).split(':');
        if (parts.length == 2) {
          end = TimeOfDay(
            hour: int.tryParse(parts[0]) ?? 8,
            minute: int.tryParse(parts[1]) ?? 0,
          );
        }
      }
      timezone = prefs['quiet_hours_timezone'] as String?;

      state = state.copyWith(
        isLoading: false,
        muteAll: muteAll,
        preferences: prefsMap,
        quietHoursStart: start,
        quietHoursEnd: end,
        quietHoursTimezone: timezone,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _extractError(e),
      );
    }
  }

  Future<void> updatePreferences({
    bool? muteAll,
    Map<String, Map<String, bool>>? preferences,
    TimeOfDay? quietHoursStart,
    TimeOfDay? quietHoursEnd,
    String? quietHoursTimezone,
  }) async {
    state = state.copyWith(isLoading: true);
    try {
      final payload = <String, dynamic>{
        if (muteAll != null) 'mute_all': muteAll,
        if (preferences != null) 'preferences': preferences,
        if (quietHoursStart != null)
          'quiet_hours_start': '${quietHoursStart.hour}:${quietHoursStart.minute}',
        if (quietHoursEnd != null)
          'quiet_hours_end': '${quietHoursEnd.hour}:${quietHoursEnd.minute}',
        if (quietHoursTimezone != null) 'quiet_hours_timezone': quietHoursTimezone,
      };

      await _repository.updateNotificationPreferences(payload);

      state = state.copyWith(
        isLoading: false,
        muteAll: muteAll ?? state.muteAll,
        preferences: preferences ?? state.preferences,
        quietHoursStart: quietHoursStart ?? state.quietHoursStart,
        quietHoursEnd: quietHoursEnd ?? state.quietHoursEnd,
        quietHoursTimezone: quietHoursTimezone ?? state.quietHoursTimezone,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _extractError(e),
      );
    }
  }

  void setMuteAll(bool value) {
    state = state.copyWith(muteAll: value);
  }

  void setChannelPreference(String notificationType, String channel, bool value) {
    final updated = Map<String, Map<String, bool>>.from(state.preferences);
    if (!updated.containsKey(notificationType)) {
      updated[notificationType] = {};
    }
    updated[notificationType] = {
      ...updated[notificationType]!,
      channel: value,
    };
    state = state.copyWith(preferences: updated);
  }

  void setQuietHours(TimeOfDay start, TimeOfDay end) {
    state = state.copyWith(
      quietHoursStart: start,
      quietHoursEnd: end,
    );
  }

  String _extractError(dynamic error) {
    if (error is DioException) {
      return error.response?.data['message'] ?? 'Failed to update preferences';
    }
    return 'Failed to update preferences';
  }
}

// ── Badge Counts Provider (Polling) ──────────────────────────────────

final badgeCountsProvider = StreamProvider.autoDispose<Map<String, int>>((ref) async* {
  final repository = ref.watch(notificationRepositoryProvider);

  // Initial load
  try {
    final counts = await repository.getBadgeCounts();
    final badges = (counts.cast<String, int>());
    yield badges;
  } catch (_) {
    yield const {};
  }

  // Poll every minute
  while (true) {
    await Future.delayed(const Duration(minutes: 1));
    try {
      final counts = await repository.getBadgeCounts();
      final badges = (counts.cast<String, int>());
      yield badges;
    } catch (_) {
      // Keep the last value on error
    }
  }
});
