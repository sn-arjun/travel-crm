import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/ai_repository.dart';

class AiLeadCreationScreen extends ConsumerStatefulWidget {
  const AiLeadCreationScreen({super.key});

  @override
  ConsumerState<AiLeadCreationScreen> createState() =>
      _AiLeadCreationScreenState();
}

class _AiLeadCreationScreenState
    extends ConsumerState<AiLeadCreationScreen> {
  final _textCtrl = TextEditingController();
  String _source = 'freeform';
  bool _loading = false;
  Map<String, dynamic>? _extracted;

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _extract() async {
    if (_textCtrl.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _extracted = null;
    });
    try {
      final repo = ref.read(aiRepositoryProvider);
      late AiLeadExtractionResult result;

      switch (_source) {
        case 'whatsapp':
          result = await repo.parseWhatsapp(_textCtrl.text.trim());
        case 'email':
          result = await repo.parseEmail(_textCtrl.text.trim());
        default:
          result = await repo.extractLead(
              text: _textCtrl.text.trim(), source: _source);
      }

      setState(() {
        _extracted = result.extracted;
      });
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Extraction failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Lead Creation')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Source selector
            Row(
              children: [
                const Text('Source: '),
                const SizedBox(width: 8),
                ...['freeform', 'whatsapp', 'email'].map((s) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(s == 'freeform' ? 'Text' : s[0].toUpperCase() + s.substring(1)),
                    selected: _source == s,
                    onSelected: (_) => setState(() => _source = s),
                  ),
                )),
              ],
            ),
            const SizedBox(height: 12),

            // Input field
            TextField(
              controller: _textCtrl,
              maxLines: 6,
              decoration: InputDecoration(
                hintText: _source == 'whatsapp'
                    ? 'Paste forwarded WhatsApp message...'
                    : _source == 'email'
                        ? 'Paste email content...'
                        : 'Enter customer inquiry text...',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),

            // Extract button
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _loading ? null : _extract,
                icon: _loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.auto_awesome),
                label: Text(_loading ? 'Extracting...' : 'Extract Lead Data'),
              ),
            ),
            const SizedBox(height: 20),

            // Extracted data
            if (_extracted != null) ...[
              AppSectionCard(
                title: 'Extracted Lead Data',
                child: Column(
                  children: _extracted!.entries
                      .where((e) => e.value != null && e.key != 'confidence')
                      .map((e) => _FieldRow(
                            label: _camelToTitle(e.key),
                            value: e.value.toString(),
                          ))
                      .toList(),
                ),
              ),
              const SizedBox(height: 8),

              // Confidence
              if (_extracted!['confidence'] != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      const Text('Confidence: ',
                          style: TextStyle(fontWeight: FontWeight.w500)),
                      Expanded(
                        child: LinearProgressIndicator(
                          value: (_extracted!['confidence'] as num).toDouble(),
                          backgroundColor:
                              theme.colorScheme.surfaceContainerHighest,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${((_extracted!['confidence'] as num) * 100).toStringAsFixed(0)}%',
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 12),

              // Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _extracted = null),
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: () {
                        // Navigate to lead form with pre-filled data
                        context.push('/leads/new', extra: _extracted);
                      },
                      icon: const Icon(Icons.add),
                      label: const Text('Create Lead'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _camelToTitle(String s) {
    return s
        .replaceAllMapped(
            RegExp(r'([A-Z])'), (m) => ' ${m.group(0)}')
        .trim()
        .split(' ')
        .map((w) => w.isNotEmpty ? w[0].toUpperCase() + w.substring(1) : '')
        .join(' ');
  }
}

class _FieldRow extends StatelessWidget {
  final String label;
  final String value;
  const _FieldRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 130,
              child: Text(label,
                  style: const TextStyle(
                      fontWeight: FontWeight.w500, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
