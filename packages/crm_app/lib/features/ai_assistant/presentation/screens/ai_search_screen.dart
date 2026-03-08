import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/ai_intelligence_repository.dart';

class AiSearchScreen extends ConsumerStatefulWidget {
  const AiSearchScreen({super.key});

  @override
  ConsumerState<AiSearchScreen> createState() => _AiSearchScreenState();
}

class _AiSearchScreenState extends ConsumerState<AiSearchScreen> {
  final _queryCtrl = TextEditingController();
  bool _loading = false;
  final List<AiNlQueryModel> _history = [];
  AiNlQueryModel? _currentResult;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  @override
  void dispose() {
    _queryCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final history = await ref.read(aiIntelligenceRepositoryProvider).getNlQueryHistory(limit: 10);
      setState(() => _history
        ..clear()
        ..addAll(history));
    } catch (_) {}
  }

  Future<void> _askQuery() async {
    final query = _queryCtrl.text.trim();
    if (query.isEmpty) return;
    setState(() => _loading = true);
    try {
      final result = await ref.read(aiIntelligenceRepositoryProvider).nlQuery(query);
      setState(() {
        _currentResult = result;
        _history.insert(0, result);
      });
      _queryCtrl.clear();
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Query failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Ask Your CRM')),
      body: Column(
        children: [
          // Query input
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _queryCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Ask anything... e.g., "How many leads this month?"',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _askQuery(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _loading ? null : _askQuery,
                  icon: _loading
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send),
                ),
              ],
            ),
          ),

          // Results
          Expanded(
            child: _currentResult != null
                ? _buildResult(theme)
                : _history.isEmpty
                    ? _buildSuggestions(theme)
                    : _buildHistory(theme),
          ),
        ],
      ),
    );
  }

  Widget _buildResult(ThemeData theme) {
    final r = _currentResult!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Query
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(r.query, style: theme.textTheme.titleSmall),
          ),
          const SizedBox(height: 16),

          // Narrative
          if (r.narrative != null && r.narrative!.isNotEmpty) ...[
            Text(r.narrative!, style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
            const SizedBox(height: 16),
          ],

          // SQL
          if (r.sql != null) ...[
            Text('Generated SQL', style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.outline)),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: SelectableText(r.sql!, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
            ),
            const SizedBox(height: 16),
          ],

          // Result data
          if (r.result != null && r.result is List && (r.result as List).isNotEmpty) ...[
            Text('Results (${(r.result as List).length} rows)', style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                border: Border.all(color: theme.colorScheme.outlineVariant),
                borderRadius: BorderRadius.circular(8),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SelectableText(
                  const JsonEncoder.withIndent('  ').convert(r.result),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Meta
          Row(
            children: [
              if (r.cost != null)
                Chip(label: Text('\$${r.cost!.toStringAsFixed(5)}')),
              const SizedBox(width: 8),
              if (r.durationMs != null)
                Chip(label: Text('${r.durationMs}ms')),
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _currentResult = null),
                child: const Text('Back to history'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestions(ThemeData theme) {
    final suggestions = [
      'How many leads were created this month?',
      'What is my total invoice amount this quarter?',
      'Which contacts have no leads?',
      'Show me top 5 destinations by lead count',
      'How many follow-ups are overdue?',
    ];

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 20),
          Icon(Icons.auto_awesome, size: 48, color: theme.colorScheme.primary),
          const SizedBox(height: 12),
          Text('Ask anything about your CRM data', style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('AI will generate SQL queries and summarize results', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
          const SizedBox(height: 24),
          Text('Try these:', style: theme.textTheme.labelMedium),
          const SizedBox(height: 8),
          ...suggestions.map((s) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: InkWell(
              onTap: () {
                _queryCtrl.text = s;
                _askQuery();
              },
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(s, style: theme.textTheme.bodySmall),
              ),
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildHistory(ThemeData theme) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _history.length,
      itemBuilder: (_, i) {
        final q = _history[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: Icon(
              q.status == 'error' ? Icons.error_outline : Icons.question_answer_outlined,
              color: q.status == 'error' ? theme.colorScheme.error : theme.colorScheme.primary,
            ),
            title: Text(q.query, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(q.narrative ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
            trailing: q.cost != null ? Text('\$${q.cost!.toStringAsFixed(4)}', style: theme.textTheme.labelSmall) : null,
            onTap: () => setState(() => _currentResult = q),
          ),
        );
      },
    );
  }
}

class JsonEncoder {
  final String? indent;
  const JsonEncoder.withIndent(this.indent);
  String convert(Object? value) {
    return _jsonEncode(value, indent ?? '', 0);
  }

  String _jsonEncode(Object? value, String indent, int depth) {
    if (value == null) return 'null';
    if (value is String) return '"$value"';
    if (value is num || value is bool) return '$value';
    if (value is List) {
      if (value.isEmpty) return '[]';
      final items = value.map((e) => '${indent * (depth + 1)}${_jsonEncode(e, indent, depth + 1)}').join(',\n');
      return '[\n$items\n${indent * depth}]';
    }
    if (value is Map) {
      if (value.isEmpty) return '{}';
      final items = value.entries.map((e) => '${indent * (depth + 1)}"${e.key}": ${_jsonEncode(e.value, indent, depth + 1)}').join(',\n');
      return '{\n$items\n${indent * depth}}';
    }
    return '"$value"';
  }
}
