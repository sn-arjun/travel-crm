import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import 'data/notification_provider.dart';
import 'presentation/widgets/notification_tile.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificationListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () => ref.read(notificationListProvider.notifier).markAllAsRead(),
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: state.status == NotificationListStatus.loading && state.notifications.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : state.status == NotificationListStatus.error && state.notifications.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 12),
                      Text('Failed to load notifications', style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => ref.read(notificationListProvider.notifier).loadNotifications(refresh: true),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : state.notifications.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.notifications_none_outlined,
                            size: 64,
                            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                          ),
                          const SizedBox(height: 16),
                          Text('No notifications', style: theme.textTheme.titleMedium),
                          const SizedBox(height: 8),
                          Text(
                            "You're all caught up!",
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () async => ref.read(notificationListProvider.notifier).loadNotifications(refresh: true),
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: state.notifications.length + (state.hasMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          // Load more indicator
                          if (index == state.notifications.length) {
                            Future.microtask(
                              () => ref.read(notificationListProvider.notifier).loadNextPage(),
                            );
                            return Padding(
                              padding: const EdgeInsets.all(16),
                              child: CircularProgressIndicator(
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  theme.colorScheme.primary,
                                ),
                              ),
                            );
                          }

                          final notification = state.notifications[index];
                          return Column(
                            children: [
                              NotificationTile(
                                notification: notification,
                                onTap: () => _onNotificationTap(context, ref, notification),
                                onDismiss: () => _deleteNotification(ref, notification['id'] as String),
                              ),
                              if (index < state.notifications.length - 1)
                                const Divider(height: 1),
                            ],
                          );
                        },
                      ),
                    ),
    );
  }

  void _onNotificationTap(BuildContext context, WidgetRef ref, Map<String, dynamic> notification) {
    // Mark as read
    if ((notification['is_read'] as int? ?? 0) == 0) {
      ref.read(notificationListProvider.notifier).markAsRead(notification['id'] as String);
    }

    // Navigate based on reference type
    final refType = notification['reference_type'] as String?;
    final refId = notification['reference_id'] as String?;

    if (refType != null && refId != null && context.mounted) {
      switch (refType) {
        case 'lead':
          context.go('/leads/$refId');
        case 'contact':
          context.go('/contacts/$refId');
        case 'invoice':
          context.go('/invoices/$refId');
        case 'task':
          context.go('/tasks/$refId');
        default:
          break;
      }
    }
  }

  void _deleteNotification(WidgetRef ref, String id) {
    ref.read(notificationListProvider.notifier).deleteNotification(id);
  }
}
