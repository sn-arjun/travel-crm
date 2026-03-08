import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/chatbot_repository.dart';

final _conversationsProvider = FutureProvider.autoDispose.family<PaginatedResponse<ChatbotConversationModel>, Map<String, String?>>((ref, params) async {
  return ref.watch(chatbotRepositoryProvider).getConversations(
    channel: params['channel'],
    status: params['status'],
  );
});

class ChatbotConversationsScreen extends ConsumerStatefulWidget {
  const ChatbotConversationsScreen({super.key});

  @override
  ConsumerState<ChatbotConversationsScreen> createState() => _ChatbotConversationsScreenState();
}

class _ChatbotConversationsScreenState extends ConsumerState<ChatbotConversationsScreen> {
  String? _status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final convsAsync = ref.watch(_conversationsProvider({'status': _status}));

    return Scaffold(
      appBar: AppBar(title: const Text('Chatbot Conversations')),
      body: Column(
        children: [
          AppFilterBar(
            filters: const ['All', 'Active', 'Handed Off', 'Qualified', 'Closed'],
            selectedFilter: _status == null ? 'All' : _status == 'handed_off' ? 'Handed Off' : '${_status![0].toUpperCase()}${_status!.substring(1)}',
            onFilterChanged: (v) => setState(() => _status = v == 'All' ? null : v == 'Handed Off' ? 'handed_off' : (v as String?)?.toLowerCase()),
          ),
          Expanded(
            child: convsAsync.when(
              data: (result) {
                final convs = result.data;
                if (convs.isEmpty) {
                  return Center(child: Text('No conversations', style: theme.textTheme.bodyMedium));
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: convs.length,
                  itemBuilder: (_, i) {
                    final conv = convs[i];
                    final channelIcon = conv.channel == 'whatsapp' ? Icons.chat : Icons.language;
                    final channelColor = conv.channel == 'whatsapp' ? Colors.green : Colors.blue;
                    final statusColor = switch (conv.status) {
                      'active' => Colors.green,
                      'handed_off' => Colors.orange,
                      'qualified' => Colors.blue,
                      'closed' => Colors.grey,
                      _ => Colors.grey,
                    };

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: channelColor.withValues(alpha: 0.12),
                          child: Icon(channelIcon, color: channelColor, size: 20),
                        ),
                        title: Text(conv.visitorName ?? conv.visitorPhone ?? conv.visitorId ?? 'Visitor', maxLines: 1),
                        subtitle: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(conv.status.toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: statusColor)),
                            ),
                            const SizedBox(width: 6),
                            Text('${conv.messageCount} msgs', style: theme.textTheme.labelSmall),
                            if (conv.totalCost > 0) ...[
                              const SizedBox(width: 6),
                              Text('\$${conv.totalCost.toStringAsFixed(4)}', style: theme.textTheme.labelSmall),
                            ],
                          ],
                        ),
                        trailing: Text(
                          conv.lastMessageAt?.substring(0, 10) ?? conv.createdAt?.substring(0, 10) ?? '',
                          style: theme.textTheme.labelSmall,
                        ),
                        onTap: () => context.push('/chatbot/conversations/${conv.id}'),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }
}
