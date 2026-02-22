import 'package:shared/shared.dart';

enum NotificationListStatus { initial, loading, loaded, error }

enum BadgeCountsStatus { initial, loading, loaded, error }

class NotificationListState {
  final NotificationListStatus status;
  final List<Map<String, dynamic>> notifications;
  final PaginationMeta? pagination;
  final String error;
  final bool unreadOnly;

  const NotificationListState({
    this.status = NotificationListStatus.initial,
    this.notifications = const [],
    this.pagination,
    this.error = '',
    this.unreadOnly = false,
  });

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.currentPage ?? 1;
  int get totalItems => pagination?.totalItems ?? 0;

  NotificationListState copyWith({
    NotificationListStatus? status,
    List<Map<String, dynamic>>? notifications,
    PaginationMeta? pagination,
    String? error,
    bool? unreadOnly,
  }) {
    return NotificationListState(
      status: status ?? this.status,
      notifications: notifications ?? this.notifications,
      pagination: pagination ?? this.pagination,
      error: error ?? this.error,
      unreadOnly: unreadOnly ?? this.unreadOnly,
    );
  }
}

class NotificationPreferencesState {
  final bool muteAll;
  final Map<String, Map<String, bool>> preferences;
  final TimeOfDay? quietHoursStart;
  final TimeOfDay? quietHoursEnd;
  final String? quietHoursTimezone;
  final bool isLoading;
  final String error;

  const NotificationPreferencesState({
    this.muteAll = false,
    this.preferences = const {},
    this.quietHoursStart,
    this.quietHoursEnd,
    this.quietHoursTimezone,
    this.isLoading = false,
    this.error = '',
  });

  NotificationPreferencesState copyWith({
    bool? muteAll,
    Map<String, Map<String, bool>>? preferences,
    TimeOfDay? quietHoursStart,
    TimeOfDay? quietHoursEnd,
    String? quietHoursTimezone,
    bool? isLoading,
    String? error,
  }) {
    return NotificationPreferencesState(
      muteAll: muteAll ?? this.muteAll,
      preferences: preferences ?? this.preferences,
      quietHoursStart: quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
      quietHoursTimezone: quietHoursTimezone ?? this.quietHoursTimezone,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

class BadgeCountsState {
  final BadgeCountsStatus status;
  final Map<String, int> counts;
  final String error;

  const BadgeCountsState({
    this.status = BadgeCountsStatus.initial,
    this.counts = const {},
    this.error = '',
  });

  int get unreadNotifications => counts['unread_notifications'] ?? 0;
  int get overdueInvoices => counts['overdue_invoices'] ?? 0;
  int get pendingTasks => counts['pending_tasks'] ?? 0;

  BadgeCountsState copyWith({
    BadgeCountsStatus? status,
    Map<String, int>? counts,
    String? error,
  }) {
    return BadgeCountsState(
      status: status ?? this.status,
      counts: counts ?? this.counts,
      error: error ?? this.error,
    );
  }
}
