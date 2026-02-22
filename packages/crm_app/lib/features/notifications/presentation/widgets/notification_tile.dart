import 'package:flutter/material.dart';

class NotificationTile extends StatelessWidget {
  final Map<String, dynamic> notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const NotificationTile({
    super.key,
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isRead = (notification['is_read'] as int? ?? 0) == 1;
    final type = notification['type'] as String? ?? 'system';
    final title = notification['title'] as String? ?? '';
    final message = notification['message'] as String? ?? '';
    final createdAt = notification['created_at'] as String?;

    return Dismissible(
      key: Key(notification['id'] as String),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 16),
        color: theme.colorScheme.errorContainer,
        child: Icon(Icons.delete_outline, color: theme.colorScheme.onErrorContainer),
      ),
      onDismissed: (_) => onDismiss(),
      child: ListTile(
        onTap: onTap,
        tileColor: isRead ? null : theme.colorScheme.primaryContainer.withValues(alpha: 0.08),
        leading: CircleAvatar(
          backgroundColor: _typeColor(type, theme).withValues(alpha: 0.12),
          child: Icon(_typeIcon(type), color: _typeColor(type, theme), size: 20),
        ),
        title: Text(
          title,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: isRead ? FontWeight.normal : FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: message.isEmpty
            ? null
            : Text(
                message,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              _timeAgo(createdAt),
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (!isRead) ...[
              const SizedBox(height: 4),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  IconData _typeIcon(String type) {
    return switch (type) {
      'lead_assigned' => Icons.person_add_outlined,
      'status_change' => Icons.update_outlined,
      'follow_up_reminder' => Icons.alarm_outlined,
      'payment_received' => Icons.payments_outlined,
      'task_assigned' => Icons.task_alt_outlined,
      'birthday' => Icons.cake_outlined,
      'invoice_overdue' => Icons.error_outline,
      'announcement' => Icons.campaign_outlined,
      _ => Icons.notifications_outlined,
    };
  }

  Color _typeColor(String type, ThemeData theme) {
    return switch (type) {
      'lead_assigned' => theme.colorScheme.primary,
      'status_change' => Colors.blue,
      'follow_up_reminder' => Colors.orange,
      'payment_received' => Colors.green,
      'task_assigned' => Colors.purple,
      'birthday' => Colors.pink,
      'invoice_overdue' => Colors.red,
      'announcement' => Colors.teal,
      _ => theme.colorScheme.secondary,
    };
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }
}
