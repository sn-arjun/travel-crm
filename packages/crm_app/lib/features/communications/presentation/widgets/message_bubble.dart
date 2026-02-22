import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../app/theme.dart';
import 'channel_badge.dart';

class MessageBubble extends StatelessWidget {
  final String channel;
  final String message;
  final bool isOutgoing;
  final DateTime timestamp;
  final String? status; // 'pending', 'sent', 'delivered', 'read'
  final String? senderName;
  final String? mediaUrl;

  const MessageBubble({
    required this.channel,
    required this.message,
    required this.isOutgoing,
    required this.timestamp,
    this.status,
    this.senderName,
    this.mediaUrl,
    super.key,
  });

  Color _getStatusColor() {
    switch (status?.toLowerCase()) {
      case 'pending':
        return AppTheme.colorGrey500;
      case 'sent':
        return AppTheme.colorGrey500;
      case 'delivered':
        return const Color(0xFF4CAF50);
      case 'read':
        return const Color(0xFF2196F3);
      default:
        return AppTheme.colorGrey500;
    }
  }

  IconData _getStatusIcon() {
    switch (status?.toLowerCase()) {
      case 'pending':
        return Icons.schedule_rounded;
      case 'sent':
        return Icons.done_rounded;
      case 'delivered':
        return Icons.done_all_rounded;
      case 'read':
        return Icons.done_all_rounded;
      default:
        return Icons.schedule_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bubbleColor = isOutgoing
        ? theme.primaryColor
        : (isDark ? Colors.grey[800] : Colors.grey[100]);
    final textColor = isOutgoing ? Colors.white : Colors.black87;

    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: AppTheme.spacingSm,
        horizontal: AppTheme.spacingMd,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            isOutgoing ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isOutgoing)
            Padding(
              padding: const EdgeInsets.only(right: AppTheme.spacingMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  ChannelBadge(channel: channel, small: true),
                ],
              ),
            ),
          Flexible(
            child: Column(
              crossAxisAlignment: isOutgoing
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (senderName != null && !isOutgoing)
                  Padding(
                    padding:
                        const EdgeInsets.only(bottom: AppTheme.spacingXs),
                    child: Text(
                      senderName!,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppTheme.colorGrey600,
                      ),
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spacingMd,
                    vertical: AppTheme.spacingSm,
                  ),
                  decoration: BoxDecoration(
                    color: bubbleColor,
                    borderRadius: BorderRadius.circular(
                      AppTheme.radiusMd,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (mediaUrl != null)
                        Padding(
                          padding: const EdgeInsets.only(
                            bottom: AppTheme.spacingSm,
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(
                              AppTheme.radiusSm,
                            ),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(
                                maxWidth: 250,
                                maxHeight: 250,
                              ),
                              child: Image.network(
                                mediaUrl!,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      Text(
                        message,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: textColor,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: AppTheme.spacingXs),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        DateFormat('HH:mm').format(timestamp),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppTheme.colorGrey600,
                        ),
                      ),
                      if (isOutgoing && status != null) ...[
                        const SizedBox(width: 4),
                        Icon(
                          _getStatusIcon(),
                          size: 14,
                          color: _getStatusColor(),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
