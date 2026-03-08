import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/ai_repository.dart';

class AiComposeScreen extends ConsumerStatefulWidget {
  const AiComposeScreen({super.key});

  @override
  ConsumerState<AiComposeScreen> createState() => _AiComposeScreenState();
}

class _AiComposeScreenState extends ConsumerState<AiComposeScreen> {
  String _channel = 'whatsapp';
  String _purpose = 'follow_up';
  String _tone = 'professional';
  String _language = 'en';
  final _customerNameCtrl = TextEditingController();
  final _destinationCtrl = TextEditingController();
  final _contextCtrl = TextEditingController();
  bool _loading = false;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _customerNameCtrl.dispose();
    _destinationCtrl.dispose();
    _contextCtrl.dispose();
    super.dispose();
  }

  Future<void> _compose() async {
    setState(() => _loading = true);
    try {
      final context = <String, dynamic>{};
      if (_customerNameCtrl.text.isNotEmpty) {
        context['customerName'] = _customerNameCtrl.text.trim();
      }
      if (_destinationCtrl.text.isNotEmpty) {
        context['destination'] = _destinationCtrl.text.trim();
      }
      if (_contextCtrl.text.isNotEmpty) {
        context['additionalContext'] = _contextCtrl.text.trim();
      }

      final result = await ref.read(aiRepositoryProvider).composeMessage(
        channel: _channel,
        purpose: _purpose,
        tone: _tone,
        language: _language,
        context: context.isNotEmpty ? context : null,
      );

      setState(() => _result = result.message);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Message Composer')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Channel selector
            Text('Channel', style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
            Row(
              children: ['whatsapp', 'email', 'sms'].map((ch) {
                final icon = ch == 'whatsapp'
                    ? Icons.chat
                    : ch == 'email'
                        ? Icons.email
                        : Icons.sms;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    avatar: Icon(icon, size: 16),
                    label: Text(ch[0].toUpperCase() + ch.substring(1)),
                    selected: _channel == ch,
                    onSelected: (_) => setState(() => _channel = ch),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),

            // Purpose
            DropdownButtonFormField<String>(
              initialValue: _purpose,
              decoration: const InputDecoration(
                labelText: 'Purpose',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                    value: 'follow_up', child: Text('Follow Up')),
                DropdownMenuItem(value: 'greeting', child: Text('Greeting')),
                DropdownMenuItem(
                    value: 'promotion', child: Text('Promotion')),
                DropdownMenuItem(
                    value: 'inquiry_response',
                    child: Text('Inquiry Response')),
                DropdownMenuItem(
                    value: 'payment_reminder',
                    child: Text('Payment Reminder')),
              ],
              onChanged: (v) => setState(() => _purpose = v!),
            ),
            const SizedBox(height: 12),

            // Tone + Language
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _tone,
                    decoration: const InputDecoration(
                      labelText: 'Tone',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                          value: 'professional',
                          child: Text('Professional')),
                      DropdownMenuItem(
                          value: 'formal', child: Text('Formal')),
                      DropdownMenuItem(
                          value: 'casual', child: Text('Casual')),
                      DropdownMenuItem(
                          value: 'enthusiastic',
                          child: Text('Enthusiastic')),
                    ],
                    onChanged: (v) => setState(() => _tone = v!),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _language,
                    decoration: const InputDecoration(
                      labelText: 'Language',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                          value: 'en', child: Text('English')),
                      DropdownMenuItem(
                          value: 'hi', child: Text('Hindi')),
                      DropdownMenuItem(
                          value: 'ar', child: Text('Arabic')),
                    ],
                    onChanged: (v) => setState(() => _language = v!),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Context fields
            TextField(
              controller: _customerNameCtrl,
              decoration: const InputDecoration(
                labelText: 'Customer Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _destinationCtrl,
              decoration: const InputDecoration(
                labelText: 'Destination',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _contextCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Additional Context',
                hintText: 'e.g., customer asked about Bali packages...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            // Generate button
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _loading ? null : _compose,
                icon: _loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.auto_awesome),
                label: Text(
                    _loading ? 'Composing...' : 'Compose Message'),
              ),
            ),
            const SizedBox(height: 20),

            // Result
            if (_result != null) ...[
              if (_result!['subject'] != null)
                AppSectionCard(
                  title: 'Subject',
                  child: SelectableText(
                    _result!['subject'] as String,
                    style: theme.textTheme.titleSmall,
                  ),
                ),
              const SizedBox(height: 8),
              AppSectionCard(
                title: 'Message',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SelectableText(
                      _result!['body'] as String? ?? '',
                      style:
                          theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        IconButton(
                          onPressed: () {
                            Clipboard.setData(ClipboardData(
                                text: _result!['body'] as String? ?? ''));
                            AppSnackbar.success(
                                context, 'Copied to clipboard');
                          },
                          icon: const Icon(Icons.copy),
                          tooltip: 'Copy',
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              if (_result!['followUpSuggestion'] != null) ...[
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer
                        .withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Follow-up: ${_result!['followUpSuggestion']}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
