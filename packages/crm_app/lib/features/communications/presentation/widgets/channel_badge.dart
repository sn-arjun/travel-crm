import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class ChannelBadge extends StatelessWidget {
  final String channel;
  final bool small;

  const ChannelBadge({
    required this.channel,
    this.small = false,
    super.key,
  });

  IconData _getChannelIcon() {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return Icons.chat_bubble_rounded;
      case 'sms':
        return Icons.sms_rounded;
      case 'email':
        return Icons.email_rounded;
      default:
        return Icons.message_rounded;
    }
  }

  Color _getChannelColor() {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return const Color(0xFF25D366);
      case 'sms':
        return const Color(0xFF2196F3);
      case 'email':
        return const Color(0xFFFF9800);
      default:
        return AppTheme.colorGrey500;
    }
  }

  String _getChannelLabel() {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return 'WhatsApp';
      case 'sms':
        return 'SMS';
      case 'email':
        return 'Email';
      default:
        return channel;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _getChannelColor();
    final icon = _getChannelIcon();
    final label = _getChannelLabel();

    if (small) {
      return Tooltip(
        message: label,
        child: Icon(
          icon,
          size: 16,
          color: color,
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingSm,
        vertical: AppTheme.spacingXs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}
