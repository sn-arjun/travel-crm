import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/chatbot_repository.dart';

class ChatbotConfigScreen extends ConsumerStatefulWidget {
  const ChatbotConfigScreen({super.key});

  @override
  ConsumerState<ChatbotConfigScreen> createState() => _ChatbotConfigScreenState();
}

class _ChatbotConfigScreenState extends ConsumerState<ChatbotConfigScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  final _greetingCtrl = TextEditingController();
  final _afterHoursCtrl = TextEditingController();
  final _systemPromptCtrl = TextEditingController();
  final _startTimeCtrl = TextEditingController();
  final _endTimeCtrl = TextEditingController();
  bool _enabled = true;
  bool _loading = false;
  String _channel = 'website';

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() {
      if (!_tabCtrl.indexIsChanging) {
        setState(() => _channel = _tabCtrl.index == 0 ? 'website' : 'whatsapp');
        _loadConfig();
      }
    });
    _loadConfig();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _greetingCtrl.dispose();
    _afterHoursCtrl.dispose();
    _systemPromptCtrl.dispose();
    _startTimeCtrl.dispose();
    _endTimeCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConfig() async {
    try {
      final config = await ref.read(chatbotRepositoryProvider).getConfig(_channel);
      setState(() {
        _enabled = config.enabled;
        _greetingCtrl.text = config.greeting ?? '';
        _afterHoursCtrl.text = config.afterHoursMessage ?? '';
        _systemPromptCtrl.text = config.systemPrompt ?? '';
        _startTimeCtrl.text = config.businessHoursStart ?? '09:00';
        _endTimeCtrl.text = config.businessHoursEnd ?? '18:00';
      });
    } catch (_) {}
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      await ref.read(chatbotRepositoryProvider).updateConfig(_channel, {
        'enabled': _enabled,
        'greeting': _greetingCtrl.text.isNotEmpty ? _greetingCtrl.text : null,
        'afterHoursMessage': _afterHoursCtrl.text.isNotEmpty ? _afterHoursCtrl.text : null,
        'systemPrompt': _systemPromptCtrl.text.isNotEmpty ? _systemPromptCtrl.text : null,
        'businessHoursStart': _startTimeCtrl.text,
        'businessHoursEnd': _endTimeCtrl.text,
      });
      if (mounted) AppSnackbar.success(context, 'Config saved');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chatbot Settings'),
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [
            Tab(icon: Icon(Icons.language), text: 'Website'),
            Tab(icon: Icon(Icons.chat), text: 'WhatsApp'),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: _loading ? null : _save,
            icon: _loading
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save),
            label: const Text('Save'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile(
              title: const Text('Enabled'),
              value: _enabled,
              onChanged: (v) => setState(() => _enabled = v),
            ),
            const SizedBox(height: 12),

            AppSectionCard(
              title: 'Greeting Message',
              child: TextField(
                controller: _greetingCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'Hello! How can I help you plan your trip?',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(height: 12),

            AppSectionCard(
              title: 'Business Hours',
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _startTimeCtrl,
                      decoration: const InputDecoration(labelText: 'Start', border: OutlineInputBorder()),
                    ),
                  ),
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('to')),
                  Expanded(
                    child: TextField(
                      controller: _endTimeCtrl,
                      decoration: const InputDecoration(labelText: 'End', border: OutlineInputBorder()),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            AppSectionCard(
              title: 'After-Hours Message',
              child: TextField(
                controller: _afterHoursCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'We\'re currently closed. Leave a message and we\'ll get back to you!',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(height: 12),

            AppSectionCard(
              title: 'AI System Prompt',
              child: TextField(
                controller: _systemPromptCtrl,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'Custom instructions for the AI chatbot...',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
