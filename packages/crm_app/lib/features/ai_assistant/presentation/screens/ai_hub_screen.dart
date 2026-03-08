import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AiHubScreen extends ConsumerWidget {
  const AiHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Assistant')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('What would you like to do?',
                style: theme.textTheme.headlineSmall),
            const SizedBox(height: 16),

            _AiFeatureCard(
              icon: Icons.person_add,
              title: 'Create Lead from Text',
              description:
                  'Paste customer inquiry text, WhatsApp message, or email to extract lead data',
              color: Colors.blue,
              onTap: () => context.push('/ai/lead-creation'),
            ),
            _AiFeatureCard(
              icon: Icons.map_outlined,
              title: 'Generate Itinerary',
              description:
                  'AI-powered day-by-day itinerary generation with budget allocation',
              color: Colors.green,
              onTap: () => context.push('/ai/itinerary'),
            ),
            _AiFeatureCard(
              icon: Icons.chat_bubble_outline,
              title: 'Compose Message',
              description:
                  'AI-crafted WhatsApp, email, or SMS messages with tone and language options',
              color: Colors.purple,
              onTap: () => context.push('/ai/compose'),
            ),
            _AiFeatureCard(
              icon: Icons.search,
              title: 'Ask Your CRM',
              description:
                  'Natural language queries — ask anything about your data',
              color: Colors.indigo,
              onTap: () => context.push('/ai/search'),
            ),
            _AiFeatureCard(
              icon: Icons.insights,
              title: 'AI Insights',
              description:
                  'Customer insights, trend detection, and actionable recommendations',
              color: Colors.deepOrange,
              onTap: () => context.push('/ai/insights'),
            ),
            _AiFeatureCard(
              icon: Icons.document_scanner,
              title: 'Document OCR',
              description:
                  'Scan passports, visa docs, and supplier invoices with AI vision',
              color: Colors.cyan,
              onTap: () => context.push('/ai/document-ocr'),
            ),
            _AiFeatureCard(
              icon: Icons.tips_and_updates,
              title: 'Smart Follow-ups',
              description:
                  'AI-suggested follow-up timing, channel, and personalized messages',
              color: Colors.amber,
              onTap: () => context.push('/ai/smart-followups'),
            ),
            _AiFeatureCard(
              icon: Icons.analytics,
              title: 'Business Intelligence',
              description:
                  'Briefings, health scores, team analytics, customer segments, and AI metering',
              color: Colors.deepPurple,
              onTap: () => context.push('/ai/bi'),
            ),
            _AiFeatureCard(
              icon: Icons.auto_awesome,
              title: 'AI Extractions',
              description:
                  'Review AI-extracted lead data from call transcripts',
              color: Colors.orange,
              onTap: () => context.push('/calls/extractions'),
            ),
            _AiFeatureCard(
              icon: Icons.record_voice_over,
              title: 'Search Transcripts',
              description:
                  'Full-text search across all call transcripts',
              color: Colors.teal,
              onTap: () => context.push('/calls/transcripts/search'),
            ),
            _AiFeatureCard(
              icon: Icons.bar_chart,
              title: 'AI Usage',
              description:
                  'Monitor AI model usage, tokens, and costs',
              color: Colors.red,
              onTap: () => context.push('/settings/ai-usage'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AiFeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final Color color;
  final VoidCallback onTap;

  const _AiFeatureCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(description,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: theme.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
