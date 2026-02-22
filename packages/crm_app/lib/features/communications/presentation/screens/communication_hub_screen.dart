import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/communication_provider.dart';
import '../../data/communication_state.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_composer.dart';
import '../widgets/quick_send_dialog.dart';

class CommunicationHubScreen extends ConsumerStatefulWidget {
  final String contactId;
  final String? contactName;

  const CommunicationHubScreen({
    required this.contactId,
    this.contactName,
    super.key,
  });

  @override
  ConsumerState<CommunicationHubScreen> createState() =>
      _CommunicationHubScreenState();
}

class _CommunicationHubScreenState
    extends ConsumerState<CommunicationHubScreen> {
  late ScrollController _scrollController;
  late TextEditingController _messageController;
  String _selectedChannel = 'whatsapp';

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _messageController = TextEditingController();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(messageHistoryProvider(widget.contactId).notifier)
          .loadHistory(refresh: true);
    });
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _messageController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 200) {
      ref
          .read(messageHistoryProvider(widget.contactId).notifier)
          .loadNextPage();
    }
  }

  void _sendMessage(String message) {
    // Implement send message logic
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Message sent via $_selectedChannel'),
      ),
    );
  }

  void _showQuickSendDialog() {
    showDialog(
      context: context,
      builder: (context) => QuickSendDialog(
        contactId: widget.contactId,
        initialChannel: _selectedChannel,
        onSend: (channel, message) {
          // Implement template send logic
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Template sent via $channel')),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(messageHistoryProvider(widget.contactId));

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.contactName ?? 'Contact'),
            Text(
              '${state.totalMessages} messages',
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Channel filter bar
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Padding(
              padding: const EdgeInsets.all(AppTheme.spacingMd),
              child: Row(
                children: ['All', 'WhatsApp', 'SMS', 'Email'].map((channel) {
                  final value = channel == 'All' ? null : channel.toLowerCase();
                  final isSelected = state.channelFilter == value;

                  return Padding(
                    padding: const EdgeInsets.only(right: AppTheme.spacingSm),
                    child: FilterChip(
                      selected: isSelected,
                      label: Text(channel),
                      onSelected: (_) {
                        ref
                            .read(messageHistoryProvider(widget.contactId)
                                .notifier)
                            .setChannelFilter(value);
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const Divider(height: 1),
          // Messages
          Expanded(
            child: _buildMessageList(context, state),
          ),
        ],
      ),
      bottomSheet: MessageComposer(
        selectedChannel: _selectedChannel,
        availableChannels: const ['WhatsApp', 'SMS', 'Email'],
        onChannelChanged: (channel) {
          setState(() => _selectedChannel = channel);
        },
        onSendMessage: _sendMessage,
        onTemplatePressed: _showQuickSendDialog,
      ),
    );
  }

  Widget _buildMessageList(BuildContext context, state) {
    if (state.status == CommunicationStatus.loading &&
        state.messages.isEmpty) {
      return const Center(
        child: AppLoading(),
      );
    }

    if (state.status == CommunicationStatus.error) {
      return Center(
        child: AppErrorWidget(
          message: state.error ?? 'Failed to load messages',
          onRetry: () {
            ref
                .read(messageHistoryProvider(widget.contactId).notifier)
                .loadHistory(refresh: true);
          },
        ),
      );
    }

    if (state.messages.isEmpty) {
      return const Center(
        child: AppEmptyState(
          title: 'No messages yet',
          description: 'Start a conversation by sending a message',
          icon: Icons.chat_bubble_outline_rounded,
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      itemCount:
          state.messages.length + (state.status == CommunicationStatus.loading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == 0 && state.status == CommunicationStatus.loading) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(AppTheme.spacingMd),
              child: AppLoading(),
            ),
          );
        }

        final msgIndex = index - (state.status == CommunicationStatus.loading ? 1 : 0);
        final message = state.messages[msgIndex];

        return MessageBubble(
          channel: message['channel'] ?? 'unknown',
          message: message['message'] ?? '',
          isOutgoing: message['direction'] == 'outgoing',
          timestamp: DateTime.tryParse(message['createdAt'] ?? '') ??
              DateTime.now(),
          status: message['status'],
          senderName: message['senderName'],
          mediaUrl: message['mediaUrl'],
        );
      },
    );
  }
}
