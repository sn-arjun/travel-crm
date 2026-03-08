import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/chatbot_repository.dart';

final _conversationProvider = FutureProvider.autoDispose.family<ChatbotConversationModel, String>((ref, id) async {
  return ref.watch(chatbotRepositoryProvider).getConversation(id);
});

class ChatbotConversationDetailScreen extends ConsumerStatefulWidget {
  final String conversationId;
  const ChatbotConversationDetailScreen({super.key, required this.conversationId});

  @override
  ConsumerState<ChatbotConversationDetailScreen> createState() => _ChatbotConversationDetailScreenState();
}

class _ChatbotConversationDetailScreenState extends ConsumerState<ChatbotConversationDetailScreen> {
  final _replyCtrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendReply() async {
    final msg = _replyCtrl.text.trim();
    if (msg.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(chatbotRepositoryProvider).replyToConversation(widget.conversationId, msg);
      _replyCtrl.clear();
      ref.invalidate(_conversationProvider);
      if (mounted) AppSnackbar.success(context, 'Reply sent');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _handoff() async {
    try {
      await ref.read(chatbotRepositoryProvider).handoffConversation(widget.conversationId);
      ref.invalidate(_conversationProvider);
      if (mounted) AppSnackbar.success(context, 'Conversation handed off');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _close() async {
    try {
      await ref.read(chatbotRepositoryProvider).closeConversation(widget.conversationId);
      ref.invalidate(_conversationProvider);
      if (mounted) AppSnackbar.success(context, 'Conversation closed');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _createLead() async {
    try {
      final leadId = await ref.read(chatbotRepositoryProvider).createLeadFromConversation(widget.conversationId);
      if (mounted) {
        AppSnackbar.success(context, 'Lead created');
        context.push('/leads/$leadId');
      }
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final convAsync = ref.watch(_conversationProvider(widget.conversationId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversation'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              switch (v) {
                case 'handoff':
                  _handoff();
                case 'close':
                  _close();
                case 'create_lead':
                  _createLead();
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'handoff', child: Text('Hand Off to Agent')),
              const PopupMenuItem(value: 'close', child: Text('Close Conversation')),
              const PopupMenuItem(value: 'create_lead', child: Text('Create Lead')),
            ],
          ),
        ],
      ),
      body: convAsync.when(
        data: (conv) => Column(
          children: [
            // Header info
            Container(
              padding: const EdgeInsets.all(12),
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              child: Row(
                children: [
                  Icon(
                    conv.channel == 'whatsapp' ? Icons.chat : Icons.language,
                    color: conv.channel == 'whatsapp' ? Colors.green : Colors.blue,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          conv.visitorName ?? conv.visitorPhone ?? 'Visitor',
                          style: theme.textTheme.titleSmall,
                        ),
                        Text(
                          '${conv.channel.toUpperCase()} • ${conv.status.toUpperCase()} • ${conv.messageCount} messages',
                          style: theme.textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  if (conv.totalCost > 0)
                    Chip(
                      label: Text('\$${conv.totalCost.toStringAsFixed(4)}'),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ),

            // Qualification data
            if (conv.qualificationData != null && conv.qualificationData!.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                color: Colors.blue.withValues(alpha: 0.05),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (conv.qualificationData!['destination'] != null)
                      Chip(
                        label: Text('${conv.qualificationData!['destination']}'),
                        avatar: const Icon(Icons.location_on, size: 16),
                        visualDensity: VisualDensity.compact,
                      ),
                    if (conv.qualificationData!['travelers'] != null)
                      Chip(
                        label: Text('${conv.qualificationData!['travelers']} pax'),
                        avatar: const Icon(Icons.people, size: 16),
                        visualDensity: VisualDensity.compact,
                      ),
                    if (conv.qualificationData!['budget'] != null)
                      Chip(
                        label: Text('Budget: ${conv.qualificationData!['budget']}'),
                        avatar: const Icon(Icons.currency_rupee, size: 16),
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ),

            // Messages
            Expanded(
              child: conv.messages != null && conv.messages!.isNotEmpty
                  ? ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: conv.messages!.length,
                      itemBuilder: (_, i) {
                        final msg = conv.messages![i];
                        final isBot = msg.role == 'assistant' || msg.role == 'bot';
                        final isUser = msg.role == 'user' || msg.role == 'visitor';

                        return Align(
                          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                            decoration: BoxDecoration(
                              color: isUser
                                  ? theme.colorScheme.primary.withValues(alpha: 0.1)
                                  : isBot
                                      ? theme.colorScheme.secondaryContainer
                                      : Colors.orange.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      isBot ? Icons.smart_toy : isUser ? Icons.person : Icons.support_agent,
                                      size: 14,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      isBot ? 'Bot' : isUser ? 'Visitor' : 'Agent',
                                      style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(width: 8),
                                    if (msg.timestamp != null)
                                      Text(
                                        msg.timestamp!.length > 16 ? msg.timestamp!.substring(11, 16) : msg.timestamp!,
                                        style: theme.textTheme.labelSmall,
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(msg.content, style: theme.textTheme.bodyMedium),
                              ],
                            ),
                          ),
                        );
                      },
                    )
                  : Center(child: Text('No messages yet', style: theme.textTheme.bodyMedium)),
            ),

            // Reply bar
            if (conv.status != 'closed')
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  border: Border(top: BorderSide(color: theme.dividerColor)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _replyCtrl,
                        decoration: const InputDecoration(
                          hintText: 'Type a reply...',
                          border: OutlineInputBorder(),
                          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          isDense: true,
                        ),
                        maxLines: null,
                        onSubmitted: (_) => _sendReply(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: _sending ? null : _sendReply,
                      icon: _sending
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send),
                    ),
                  ],
                ),
              ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
