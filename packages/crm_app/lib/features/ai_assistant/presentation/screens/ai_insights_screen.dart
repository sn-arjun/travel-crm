import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/ai_intelligence_repository.dart';

final _insightsProvider = FutureProvider.autoDispose.family<List<AiInsightModel>, String?>((ref, type) async {
  return ref.watch(aiIntelligenceRepositoryProvider).getInsights(type: type);
});

final _recommendationsProvider = FutureProvider.autoDispose<List<AiRecommendationModel>>((ref) async {
  return ref.watch(aiIntelligenceRepositoryProvider).getRecommendations();
});

class AiInsightsScreen extends ConsumerStatefulWidget {
  const AiInsightsScreen({super.key});

  @override
  ConsumerState<AiInsightsScreen> createState() => _AiInsightsScreenState();
}

class _AiInsightsScreenState extends ConsumerState<AiInsightsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  String? _insightType;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Insights'),
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [
            Tab(text: 'Insights'),
            Tab(text: 'Recommendations'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.trending_up),
            tooltip: 'Detect Trends',
            onPressed: _detectTrends,
          ),
          IconButton(
            icon: const Icon(Icons.lightbulb_outline),
            tooltip: 'Generate Predictions',
            onPressed: _generatePredictions,
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          _buildInsightsTab(theme),
          _buildRecommendationsTab(theme),
        ],
      ),
    );
  }

  Widget _buildInsightsTab(ThemeData theme) {
    final insightsAsync = ref.watch(_insightsProvider(_insightType));

    return Column(
      children: [
        AppFilterBar(
          filters: const ['All', 'Customer', 'Anomaly', 'Trend', 'Prediction'],
          selectedFilter: _insightType ?? 'All',
          onFilterChanged: (v) => setState(() => _insightType = v == 'All' ? null : (v as String?)?.toLowerCase()),
        ),
        Expanded(
          child: insightsAsync.when(
            data: (insights) => insights.isEmpty
                ? Center(child: Text('No insights yet', style: theme.textTheme.bodyMedium))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: insights.length,
                    itemBuilder: (_, i) => _InsightCard(insight: insights[i], onDismiss: () => _dismissInsight(insights[i].id)),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        ),
      ],
    );
  }

  Widget _buildRecommendationsTab(ThemeData theme) {
    final recsAsync = ref.watch(_recommendationsProvider);

    return recsAsync.when(
      data: (recs) => recs.isEmpty
          ? Center(child: Text('No recommendations', style: theme.textTheme.bodyMedium))
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: recs.length,
              itemBuilder: (_, i) => _RecommendationCard(
                rec: recs[i],
                onDismiss: () => _dismissRecommendation(recs[i].id),
                onAct: () => _actOnRecommendation(recs[i].id),
              ),
            ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }

  Future<void> _dismissInsight(String id) async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).dismissInsight(id);
      ref.invalidate(_insightsProvider);
      if (mounted) AppSnackbar.success(context, 'Insight dismissed');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _dismissRecommendation(String id) async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).dismissRecommendation(id);
      ref.invalidate(_recommendationsProvider);
      if (mounted) AppSnackbar.success(context, 'Dismissed');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _actOnRecommendation(String id) async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).actOnRecommendation(id);
      ref.invalidate(_recommendationsProvider);
      if (mounted) AppSnackbar.success(context, 'Marked as acted on');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _detectTrends() async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).detectTrends();
      ref.invalidate(_insightsProvider);
      if (mounted) AppSnackbar.success(context, 'Trend analysis complete');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _generatePredictions() async {
    try {
      await ref.read(aiIntelligenceRepositoryProvider).generatePredictions();
      ref.invalidate(_recommendationsProvider);
      if (mounted) AppSnackbar.success(context, 'Predictions generated');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }
}

class _InsightCard extends StatelessWidget {
  final AiInsightModel insight;
  final VoidCallback onDismiss;

  const _InsightCard({required this.insight, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final priorityColor = switch (insight.priority) {
      'urgent' => Colors.red,
      'high' => Colors.orange,
      'medium' => Colors.blue,
      _ => Colors.grey,
    };

    final typeIcon = switch (insight.insightType) {
      'customer_summary' => Icons.person,
      'anomaly' => Icons.warning_amber,
      'trend' => Icons.trending_up,
      'prediction' => Icons.lightbulb,
      _ => Icons.insights,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(typeIcon, size: 20, color: priorityColor),
                const SizedBox(width: 8),
                Expanded(child: Text(insight.title, style: theme.textTheme.titleSmall)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: priorityColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(insight.priority.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: priorityColor)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(insight.summary, style: theme.textTheme.bodySmall?.copyWith(height: 1.4)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (insight.actionable)
                  TextButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.open_in_new, size: 14),
                    label: const Text('Take Action'),
                  ),
                TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  final AiRecommendationModel rec;
  final VoidCallback onDismiss;
  final VoidCallback onAct;

  const _RecommendationCard({required this.rec, required this.onDismiss, required this.onAct});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.tips_and_updates, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(rec.title, style: theme.textTheme.titleSmall)),
                if (rec.impactScore != null)
                  Chip(
                    label: Text('${(rec.impactScore! * 100).toInt()}%'),
                    labelStyle: const TextStyle(fontSize: 10),
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(rec.description, style: theme.textTheme.bodySmall),
            if (rec.reasoning != null) ...[
              const SizedBox(height: 4),
              Text(rec.reasoning!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline, fontStyle: FontStyle.italic)),
            ],
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
                const SizedBox(width: 8),
                FilledButton.tonal(onPressed: onAct, child: const Text('Act On It')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
