import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/ai_intelligence_repository.dart';

class LeadScoreScreen extends ConsumerStatefulWidget {
  final String leadId;
  const LeadScoreScreen({super.key, required this.leadId});

  @override
  ConsumerState<LeadScoreScreen> createState() => _LeadScoreScreenState();
}

class _LeadScoreScreenState extends ConsumerState<LeadScoreScreen> {
  AiLeadScoreModel? _score;
  List<AiLeadScoreModel> _history = [];
  bool _loading = false;
  bool _calculating = false;

  @override
  void initState() {
    super.initState();
    _loadScore();
  }

  Future<void> _loadScore() async {
    setState(() => _loading = true);
    try {
      final repo = ref.read(aiIntelligenceRepositoryProvider);
      final score = await repo.getLeadScore(widget.leadId);
      final history = await repo.getLeadScoreHistory(widget.leadId);
      setState(() {
        _score = score;
        _history = history;
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _calculateScore() async {
    setState(() => _calculating = true);
    try {
      final score = await ref.read(aiIntelligenceRepositoryProvider).calculateLeadScore(widget.leadId);
      setState(() {
        _score = score;
        _history.insert(0, score);
      });
      if (mounted) AppSnackbar.success(context, 'Score calculated: ${score.score}');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Scoring failed: $e');
    } finally {
      if (mounted) setState(() => _calculating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lead Score'),
        actions: [
          IconButton(
            icon: _calculating
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.refresh),
            tooltip: 'Recalculate',
            onPressed: _calculating ? null : _calculateScore,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _score == null
              ? _buildNoScore(theme)
              : _buildScoreView(theme),
    );
  }

  Widget _buildNoScore(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.score_outlined, size: 64, color: theme.colorScheme.outline),
          const SizedBox(height: 12),
          Text('No score calculated yet', style: theme.textTheme.titleMedium),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _calculating ? null : _calculateScore,
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Calculate AI Score'),
          ),
        ],
      ),
    );
  }

  Widget _buildScoreView(ThemeData theme) {
    final score = _score!;
    final scoreColor = switch (score.category) {
      'hot' => Colors.red,
      'warm' => Colors.orange,
      _ => Colors.blue,
    };

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Main score display
          Center(
            child: Column(
              children: [
                SizedBox(
                  width: 120,
                  height: 120,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: score.score / 100,
                        strokeWidth: 10,
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                        valueColor: AlwaysStoppedAnimation(scoreColor),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${score.score}', style: theme.textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.bold, color: scoreColor)),
                          Text(score.category.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: scoreColor)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                if (score.scoreChange != null)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        score.scoreChange! > 0 ? Icons.arrow_upward : score.scoreChange! < 0 ? Icons.arrow_downward : Icons.remove,
                        size: 16,
                        color: score.scoreChange! > 0 ? Colors.green : score.scoreChange! < 0 ? Colors.red : Colors.grey,
                      ),
                      Text(
                        '${score.scoreChange! > 0 ? '+' : ''}${score.scoreChange} from previous',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Breakdown
          if (score.breakdown != null) ...[
            AppSectionCard(
              title: 'Score Breakdown',
              child: Column(
                children: score.breakdown!.entries.map((e) {
                  final val = (e.value as num).toDouble();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        SizedBox(width: 110, child: Text(_capitalize(e.key), style: theme.textTheme.bodySmall)),
                        Expanded(
                          child: LinearProgressIndicator(
                            value: val / 30,
                            backgroundColor: theme.colorScheme.surfaceContainerHighest,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text('${val.toInt()}', style: theme.textTheme.labelSmall),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Signals
          if (score.signals != null && score.signals!.isNotEmpty) ...[
            AppSectionCard(
              title: 'Signal Contributions',
              child: Column(
                children: score.signals!.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Expanded(child: Text(s.name, style: theme.textTheme.bodySmall)),
                      SizedBox(
                        width: 60,
                        child: LinearProgressIndicator(
                          value: s.contribution.abs() / 20,
                          backgroundColor: theme.colorScheme.surfaceContainerHighest,
                          valueColor: AlwaysStoppedAnimation(s.contribution >= 0 ? Colors.green : Colors.red),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 40,
                        child: Text(
                          '${s.contribution >= 0 ? '+' : ''}${s.contribution.toStringAsFixed(1)}',
                          style: TextStyle(fontSize: 11, color: s.contribution >= 0 ? Colors.green : Colors.red),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                )).toList(),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // History
          if (_history.length > 1) ...[
            AppSectionCard(
              title: 'Score History',
              child: Column(
                children: _history.take(5).map((h) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      SizedBox(width: 40, child: Text('${h.score}', style: theme.textTheme.titleSmall)),
                      Chip(
                        label: Text(h.category),
                        labelStyle: const TextStyle(fontSize: 10),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                      ),
                      const Spacer(),
                      Text(h.calculatedAt?.substring(0, 10) ?? '', style: theme.textTheme.labelSmall),
                    ],
                  ),
                )).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _capitalize(String s) => s.isNotEmpty ? s[0].toUpperCase() + s.substring(1) : '';
}
