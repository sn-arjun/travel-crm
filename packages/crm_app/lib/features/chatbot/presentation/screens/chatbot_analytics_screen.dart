import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/chatbot_repository.dart';

final _analyticsProvider = FutureProvider.autoDispose.family<ChatbotAnalytics, String>((ref, period) async {
  return ref.watch(chatbotRepositoryProvider).getAnalytics(period: period);
});

class ChatbotAnalyticsScreen extends ConsumerStatefulWidget {
  const ChatbotAnalyticsScreen({super.key});

  @override
  ConsumerState<ChatbotAnalyticsScreen> createState() => _ChatbotAnalyticsScreenState();
}

class _ChatbotAnalyticsScreenState extends ConsumerState<ChatbotAnalyticsScreen> {
  String _period = '30d';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final analyticsAsync = ref.watch(_analyticsProvider(_period));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chatbot Analytics'),
        actions: [
          DropdownButton<String>(
            value: _period,
            underline: const SizedBox.shrink(),
            items: const [
              DropdownMenuItem(value: '7d', child: Text('7 Days')),
              DropdownMenuItem(value: '30d', child: Text('30 Days')),
              DropdownMenuItem(value: '90d', child: Text('90 Days')),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _period = v);
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: analyticsAsync.when(
        data: (analytics) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top stats
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  SizedBox(
                    width: 160,
                    child: AppStatCard(
                      title: 'Total Conversations',
                      value: '${analytics.totalConversations}',
                      icon: Icons.chat_bubble_outline,
                    ),
                  ),
                  SizedBox(
                    width: 160,
                    child: AppStatCard(
                      title: 'Handoffs',
                      value: '${analytics.handoffCount}',
                      icon: Icons.swap_horiz,
                      iconColor: Colors.orange,
                    ),
                  ),
                  SizedBox(
                    width: 160,
                    child: AppStatCard(
                      title: 'Qualified',
                      value: '${analytics.qualifiedCount}',
                      icon: Icons.check_circle_outline,
                      iconColor: Colors.blue,
                    ),
                  ),
                  SizedBox(
                    width: 160,
                    child: AppStatCard(
                      title: 'AI Cost',
                      value: '\$${analytics.totalAiCost.toStringAsFixed(2)}',
                      icon: Icons.attach_money,
                      iconColor: Colors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Conversion funnel
              AppSectionCard(
                title: 'Conversation Funnel',
                child: Column(
                  children: [
                    _buildFunnelRow('Handoff Rate', analytics.handoffCount, analytics.totalConversations, Colors.orange, theme),
                    const SizedBox(height: 8),
                    _buildFunnelRow('Qualified', analytics.qualifiedCount, analytics.totalConversations, Colors.blue, theme),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Engagement
              AppSectionCard(
                title: 'Engagement',
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.message, color: Colors.teal),
                      title: const Text('Avg Messages / Conversation'),
                      trailing: Text(
                        '${analytics.avgMessagesPerConversation}',
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      dense: true,
                    ),
                    ListTile(
                      leading: const Icon(Icons.percent, color: Colors.deepPurple),
                      title: const Text('Handoff Rate'),
                      trailing: Text(
                        '${analytics.handoffRate}%',
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      dense: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Channel breakdown
              if (analytics.byChannel != null && analytics.byChannel!.isNotEmpty)
                AppSectionCard(
                  title: 'By Channel',
                  child: Column(
                    children: analytics.byChannel!.map((entry) {
                      final channel = entry['channel']?.toString() ?? 'unknown';
                      final count = entry['count'] ?? 0;
                      final icon = channel == 'whatsapp' ? Icons.chat : Icons.language;
                      final color = channel == 'whatsapp' ? Colors.green : Colors.blue;
                      return ListTile(
                        leading: Icon(icon, color: color),
                        title: Text(channel.toUpperCase()),
                        trailing: Text(
                          '$count',
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        dense: true,
                      );
                    }).toList(),
                  ),
                ),
              const SizedBox(height: 16),

              // Status breakdown
              if (analytics.byStatus != null && analytics.byStatus!.isNotEmpty)
                AppSectionCard(
                  title: 'By Status',
                  child: Column(
                    children: analytics.byStatus!.map((entry) {
                      final status = entry['status']?.toString() ?? 'unknown';
                      final count = entry['count'] ?? 0;
                      final color = switch (status) {
                        'active' => Colors.green,
                        'handed_off' => Colors.orange,
                        'qualified' => Colors.blue,
                        'closed' => Colors.grey,
                        _ => Colors.grey,
                      };
                      return ListTile(
                        leading: Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                        ),
                        title: Text(status.replaceAll('_', ' ').toUpperCase()),
                        trailing: Text(
                          '$count',
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        dense: true,
                      );
                    }).toList(),
                  ),
                ),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _buildFunnelRow(String label, int count, int total, Color color, ThemeData theme) {
    final pct = total > 0 ? count / total : 0.0;
    return Row(
      children: [
        SizedBox(width: 100, child: Text(label, style: theme.textTheme.bodySmall)),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct,
              backgroundColor: color.withValues(alpha: 0.1),
              color: color,
              minHeight: 16,
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 60,
          child: Text(
            '$count (${(pct * 100).toStringAsFixed(0)}%)',
            style: theme.textTheme.labelSmall,
            textAlign: TextAlign.right,
          ),
        ),
      ],
    );
  }
}
