import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

// ── Provider ──────────────────────────────────────────────

final _extractionProvider = FutureProvider.autoDispose
    .family<AiExtractionModel, String>((ref, id) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getExtraction(id);
});

// ── Screen ────────────────────────────────────────────────

class ExtractionDetailScreen extends ConsumerStatefulWidget {
  final String extractionId;
  const ExtractionDetailScreen({super.key, required this.extractionId});

  @override
  ConsumerState<ExtractionDetailScreen> createState() =>
      _ExtractionDetailScreenState();
}

class _ExtractionDetailScreenState
    extends ConsumerState<ExtractionDetailScreen> {
  bool _processing = false;

  Future<void> _confirm(AiExtractionModel extraction) async {
    setState(() => _processing = true);
    try {
      final request = ExtractionConfirmRequest(
        destination: extraction.destination,
        paxCount: extraction.paxCount,
        budget: extraction.budget,
        tripType: extraction.tripType,
      );
      final result = await ref
          .read(voipRepositoryProvider)
          .confirmExtraction(widget.extractionId, request);
      if (mounted) {
        AppSnackbar.success(context,
            'Lead created: ${result['leadId'] ?? 'success'}');
        context.pop();
      }
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _reject() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reject Extraction?'),
        content:
            const Text('This extraction will be marked as rejected.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Reject')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _processing = true);
    try {
      await ref
          .read(voipRepositoryProvider)
          .rejectExtraction(widget.extractionId);
      if (mounted) {
        AppSnackbar.success(context, 'Extraction rejected');
        context.pop();
      }
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final asyncData = ref.watch(_extractionProvider(widget.extractionId));

    return Scaffold(
      appBar: AppBar(title: const Text('Extraction Review')),
      body: asyncData.when(
        loading: () => const AppLoading(),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (extraction) => _buildContent(extraction, theme),
      ),
    );
  }

  Widget _buildContent(AiExtractionModel extraction, ThemeData theme) {
    final isPending = extraction.status == 'pending';

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Status banner
                _StatusBanner(
                    status: extraction.status,
                    reviewedAt: extraction.reviewedAt),
                const SizedBox(height: 16),

                // Lead data
                AppSectionCard(
                  title: 'Lead Information',
                  child: Column(
                    children: [
                      _fieldRow('Destination',
                          extraction.destination ?? 'Not identified'),
                      _fieldRow('Trip Type',
                          extraction.tripType ?? 'Not identified'),
                      _fieldRow('Pax Count',
                          extraction.paxCount?.toString() ?? '-'),
                      _fieldRow('Budget', extraction.budget != null
                          ? '${extraction.budgetCurrency ?? '\$'}${extraction.budget!.toStringAsFixed(0)}'
                          : '-'),
                      if (extraction.travelDates != null) ...[
                        _fieldRow('Travel From',
                            extraction.travelDates!.from ?? '-'),
                        _fieldRow('Travel To',
                            extraction.travelDates!.to ?? '-'),
                        _fieldRow('Flexible',
                            extraction.travelDates!.flexible ? 'Yes' : 'No'),
                      ],
                      _fieldRow('Hotel Preference',
                          extraction.hotelPreference ?? '-'),
                      _fieldRow('Meal Preference',
                          extraction.mealPreference ?? '-'),
                      if (extraction.specialRequests != null)
                        _fieldRow(
                            'Special Requests', extraction.specialRequests!),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Preferences
                if (extraction.preferences.isNotEmpty)
                  AppSectionCard(
                    title: 'Preferences',
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: extraction.preferences
                          .map((p) => Chip(
                                label: Text(p, style: const TextStyle(fontSize: 12)),
                                visualDensity: VisualDensity.compact,
                              ))
                          .toList(),
                    ),
                  ),
                if (extraction.preferences.isNotEmpty)
                  const SizedBox(height: 12),

                // Summary
                if (extraction.summary.isNotEmpty)
                  AppSectionCard(
                    title: 'Call Summary',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: extraction.summary
                          .map((s) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('  \u2022  '),
                                    Expanded(child: Text(s)),
                                  ],
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                if (extraction.summary.isNotEmpty) const SizedBox(height: 12),

                // Key topics
                if (extraction.keyTopics.isNotEmpty)
                  AppSectionCard(
                    title: 'Key Topics',
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: extraction.keyTopics
                          .map((t) => Chip(
                                label: Text(t, style: const TextStyle(fontSize: 12)),
                                backgroundColor: theme
                                    .colorScheme.primaryContainer,
                                visualDensity: VisualDensity.compact,
                              ))
                          .toList(),
                    ),
                  ),
                if (extraction.keyTopics.isNotEmpty)
                  const SizedBox(height: 12),

                // Action items
                if (extraction.actionItems.isNotEmpty)
                  AppSectionCard(
                    title: 'Action Items',
                    child: Column(
                      children: extraction.actionItems
                          .map((a) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(Icons.check_circle_outline,
                                        size: 18),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(a.text),
                                          if (a.dueDate != null ||
                                              a.priority != null)
                                            Text(
                                              [
                                                if (a.dueDate != null)
                                                  'Due: ${a.dueDate}',
                                                if (a.priority != null)
                                                  a.priority!,
                                              ].join(' | '),
                                              style: theme.textTheme.bodySmall
                                                  ?.copyWith(
                                                      color: theme.colorScheme
                                                          .outline),
                                            ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                if (extraction.actionItems.isNotEmpty)
                  const SizedBox(height: 12),

                // Sentiment & Deal
                AppSectionCard(
                  title: 'Analysis',
                  child: Column(
                    children: [
                      _SentimentRow(
                        sentiment: extraction.sentiment ?? 'unknown',
                        score: extraction.sentimentScore,
                      ),
                      const SizedBox(height: 8),
                      _DealLikelihoodBar(
                          likelihood: extraction.dealLikelihood),
                      if (extraction.likelihoodSignals.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        ...extraction.likelihoodSignals.map(
                          (s) => Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Row(
                              children: [
                                const Icon(Icons.arrow_right, size: 16),
                                Expanded(
                                    child: Text(s,
                                        style: theme.textTheme.bodySmall)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Coaching hints
                if (extraction.coachingHints.isNotEmpty)
                  AppSectionCard(
                    title: 'Coaching Hints',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: extraction.coachingHints
                          .map((h) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(Icons.lightbulb_outline,
                                        size: 16, color: Colors.amber),
                                    const SizedBox(width: 6),
                                    Expanded(child: Text(h,
                                        style: theme.textTheme.bodySmall)),
                                  ],
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                if (extraction.coachingHints.isNotEmpty)
                  const SizedBox(height: 12),

                // Confidence breakdown
                if (extraction.fieldConfidences.isNotEmpty)
                  AppSectionCard(
                    title: 'Field Confidence',
                    child: Column(
                      children: extraction.fieldConfidences.entries
                          .map((e) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    SizedBox(
                                        width: 120,
                                        child: Text(
                                          _camelToTitle(e.key),
                                          style: theme.textTheme.bodySmall,
                                        )),
                                    Expanded(
                                      child: LinearProgressIndicator(
                                        value: e.value,
                                        backgroundColor: theme.colorScheme
                                            .surfaceContainerHighest,
                                        color: _confidenceColor(e.value),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      '${(e.value * 100).toStringAsFixed(0)}%',
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ))
                          .toList(),
                    ),
                  ),

                // Cost info
                if (extraction.modelUsed != null) ...[
                  const SizedBox(height: 12),
                  AppSectionCard(
                    title: 'AI Details',
                    child: Column(
                      children: [
                        _fieldRow('Model', extraction.modelUsed!),
                        _fieldRow('Tokens',
                            extraction.tokensUsed?.toString() ?? '-'),
                        _fieldRow(
                            'Cost',
                            extraction.costEstimate != null
                                ? '\$${extraction.costEstimate!.toStringAsFixed(4)}'
                                : '-'),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 80),
              ],
            ),
          ),
        ),

        // Bottom action bar
        if (isPending)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              border: Border(
                  top: BorderSide(color: theme.colorScheme.outlineVariant)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _processing ? null : _reject,
                    icon: const Icon(Icons.close),
                    label: const Text('Reject'),
                    style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton.icon(
                    onPressed: _processing
                        ? null
                        : () => _confirm(extraction),
                    icon: _processing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check),
                    label: const Text('Confirm & Create Lead'),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _fieldRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 130,
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w500,
                      fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }

  String _camelToTitle(String s) {
    return s
        .replaceAllMapped(
            RegExp(r'([A-Z])'), (m) => ' ${m.group(0)}')
        .trim();
  }

  Color _confidenceColor(double v) {
    if (v >= 0.8) return Colors.green;
    if (v >= 0.5) return Colors.orange;
    return Colors.red;
  }
}

// ── Widgets ────────────────────────────────────────────────

class _StatusBanner extends StatelessWidget {
  final String status;
  final String? reviewedAt;

  const _StatusBanner({required this.status, this.reviewedAt});

  @override
  Widget build(BuildContext context) {
    final (color, icon, label) = switch (status) {
      'pending' => (Colors.orange, Icons.pending_outlined, 'Pending Review'),
      'confirmed' => (Colors.green, Icons.check_circle, 'Confirmed'),
      'rejected' => (Colors.red, Icons.cancel, 'Rejected'),
      _ => (Colors.grey, Icons.help_outline, status),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: TextStyle(
                      fontWeight: FontWeight.bold, color: color)),
              if (reviewedAt != null)
                Text('Reviewed: $reviewedAt',
                    style:
                        TextStyle(fontSize: 11, color: color.withValues(alpha: 0.7))),
            ],
          ),
        ],
      ),
    );
  }
}

class _SentimentRow extends StatelessWidget {
  final String sentiment;
  final double? score;

  const _SentimentRow({required this.sentiment, this.score});

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = switch (sentiment) {
      'positive' => (Icons.sentiment_satisfied, Colors.green, 'Positive'),
      'negative' => (Icons.sentiment_dissatisfied, Colors.red, 'Negative'),
      'urgent' => (Icons.warning_amber, Colors.deepOrange, 'Urgent'),
      _ => (Icons.sentiment_neutral, Colors.grey, 'Neutral'),
    };

    return Row(
      children: [
        const SizedBox(
            width: 130,
            child: Text('Sentiment',
                style: TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
        if (score != null) ...[
          const SizedBox(width: 8),
          Text('(${score!.toStringAsFixed(2)})',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Theme.of(context).colorScheme.outline)),
        ],
      ],
    );
  }
}

class _DealLikelihoodBar extends StatelessWidget {
  final double? likelihood;

  const _DealLikelihoodBar({this.likelihood});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final value = likelihood ?? 0;
    final color = value >= 0.7
        ? Colors.green
        : value >= 0.4
            ? Colors.orange
            : Colors.red;

    return Row(
      children: [
        const SizedBox(
            width: 130,
            child: Text('Deal Likelihood',
                style: TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        Expanded(
          child: LinearProgressIndicator(
            value: value,
            backgroundColor: theme.colorScheme.surfaceContainerHighest,
            color: color,
            minHeight: 8,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 8),
        Text('${(value * 100).toStringAsFixed(0)}%',
            style: TextStyle(
                fontWeight: FontWeight.bold, color: color, fontSize: 13)),
      ],
    );
  }
}
