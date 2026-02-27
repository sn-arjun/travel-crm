import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class MessageComposer extends StatefulWidget {
  final String selectedChannel;
  final List<String> availableChannels;
  final Function(String channel) onChannelChanged;
  final Function(String message) onSendMessage;
  final Function() onTemplatePressed;
  final bool isLoading;

  const MessageComposer({
    required this.selectedChannel,
    required this.availableChannels,
    required this.onChannelChanged,
    required this.onSendMessage,
    required this.onTemplatePressed,
    this.isLoading = false,
    super.key,
  });

  @override
  State<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends State<MessageComposer> {
  late TextEditingController _messageController;

  @override
  void initState() {
    super.initState();
    _messageController = TextEditingController();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final message = _messageController.text.trim();
    if (message.isEmpty) return;

    widget.onSendMessage(message);
    _messageController.clear();
  }

  IconData _getChannelIcon(String channel) {
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

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: AppTheme.colorGrey200,
          ),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Channel selector
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: widget.availableChannels.map((channel) {
                final isSelected = widget.selectedChannel == channel;
                return Padding(
                  padding: const EdgeInsets.only(right: AppTheme.spacingSm),
                  child: FilterChip(
                    selected: isSelected,
                    label: Row(
                      children: [
                        Icon(
                          _getChannelIcon(channel),
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(channel),
                      ],
                    ),
                    onSelected: (_) =>
                        widget.onChannelChanged(channel),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          // Message input
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _messageController,
                  maxLines: null,
                  minLines: 1,
                  enabled: !widget.isLoading,
                  decoration: InputDecoration(
                    hintText: 'Type your message...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(
                        AppTheme.radiusMd,
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: AppTheme.spacingMd,
                      vertical: AppTheme.spacingSm,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Tooltip(
                message: 'Use template',
                child: IconButton(
                  icon: const Icon(Icons.lightbulb_outline_rounded),
                  onPressed: !widget.isLoading
                      ? widget.onTemplatePressed
                      : null,
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Tooltip(
                message: 'Send message',
                child: IconButton.filled(
                  icon: const Icon(Icons.send_rounded),
                  onPressed: !widget.isLoading ? _sendMessage : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
