import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

/// TICKET-389: Call Analytics Dashboard

final _analyticsProvider = FutureProvider.autoDispose
    .family<CallAnalyticsModel, Map<String, String>>((ref, params) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getAnalytics(
    fromDate: params['fromDate'],
    toDate: params['toDate'],
  );
});

class CallAnalyticsScreen extends ConsumerStatefulWidget {
  const CallAnalyticsScreen({super.key});

  @override
  ConsumerState<CallAnalyticsScreen> createState() =>
      _CallAnalyticsScreenState();
}

class _CallAnalyticsScreenState extends ConsumerState<CallAnalyticsScreen> {
  String _range = '30d';

  Map<String, String> get _params {
    final now = DateTime.now();
    late DateTime from;
    switch (_range) {
      case '7d':
        from = now.subtract(const Duration(days: 7));
      case '30d':
        from = now.subtract(const Duration(days: 30));
      case '90d':
        from = now.subtract(const Duration(days: 90));
      default:
        from = now.subtract(const Duration(days: 30));
    }
    return {
      'fromDate': from.toIso8601String().substring(0, 10),
      'toDate': now.toIso8601String().substring(0, 10),
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final asyncData = ref.watch(_analyticsProvider(_params));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Expanded(
                child: Text('Call Analytics',
                    style: theme.textTheme.headlineSmall),
              ),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: '7d', label: Text('7D')),
                  ButtonSegment(value: '30d', label: Text('30D')),
                  ButtonSegment(value: '90d', label: Text('90D')),
                ],
                selected: {_range},
                onSelectionChanged: (v) =>
                    setState(() => _range = v.first),
              ),
            ],
          ),
          const SizedBox(height: 24),

          asyncData.when(
            loading: () => const AppLoading(),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (data) => _buildContent(context, data),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context, CallAnalyticsModel data) {
    final theme = Theme.of(context);
    final s = data.summary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Summary cards
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Total Calls',
                value: s.totalCalls.toString(),
                icon: Icons.phone,
              ),
            ),
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Inbound',
                value: s.inboundCalls.toString(),
                icon: Icons.phone_callback,
              ),
            ),
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Outbound',
                value: s.outboundCalls.toString(),
                icon: Icons.phone_forwarded,
              ),
            ),
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Missed',
                value: s.missedCalls.toString(),
                icon: Icons.phone_missed,
              ),
            ),
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Success Rate',
                value: '${s.successRate}%',
                icon: Icons.check_circle_outline,
              ),
            ),
            SizedBox(
              width: 200,
              child: AppStatCard(
                title: 'Avg Duration',
                value: _fmtDuration(s.avgDurationSeconds.round()),
                icon: Icons.timer_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Daily trend (simplified bar chart)
        if (data.dailyCalls.isNotEmpty)
          AppSectionCard(
            title: 'Daily Call Volume',
            child: SizedBox(
              height: 160,
              child: _DailyChart(data: data.dailyCalls),
            ),
          ),
        const SizedBox(height: 16),

        // Top Agents
        if (data.topAgents.isNotEmpty) ...[
          AppSectionCard(
            title: 'Top Agents',
            child: Column(
              children: data.topAgents.map((a) {
                return ListTile(
                  leading: CircleAvatar(
                    child: Text(a.name.isNotEmpty
                        ? a.name[0].toUpperCase()
                        : '?'),
                  ),
                  title: Text(a.name),
                  subtitle: Text(
                      '${a.totalCalls} calls, ${a.completed} completed'),
                  trailing: Text(
                    'Avg ${_fmtDuration(a.avgDuration.round())}',
                    style: theme.textTheme.bodySmall,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Outcome Distribution
        if (data.outcomes.isNotEmpty) ...[
          AppSectionCard(
            title: 'Outcome Distribution',
            child: Column(
              children: data.outcomes.map((o) {
                final pct = s.totalCalls > 0
                    ? (o.count / s.totalCalls * 100).round()
                    : 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 140,
                        child: Text(
                          _labelOutcome(o.outcome),
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                      Expanded(
                        child: LinearProgressIndicator(
                          value: pct / 100,
                          minHeight: 8,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 50,
                        child: Text('$pct%',
                            textAlign: TextAlign.right,
                            style: theme.textTheme.bodySmall),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Hourly Distribution
        if (data.hourlyDistribution.isNotEmpty)
          AppSectionCard(
            title: 'Calls by Hour',
            child: SizedBox(
              height: 120,
              child: _HourlyChart(data: data.hourlyDistribution),
            ),
          ),
        const SizedBox(height: 32),
      ],
    );
  }

  String _fmtDuration(int seconds) {
    if (seconds == 0) return '0:00';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _labelOutcome(String outcome) {
    return switch (outcome) {
      'interested' => 'Interested',
      'not_interested' => 'Not Interested',
      'follow_up_needed' => 'Follow-up',
      'wrong_number' => 'Wrong Number',
      'no_answer' => 'No Answer',
      'voicemail' => 'Voicemail',
      _ => outcome,
    };
  }
}

class _DailyChart extends StatelessWidget {
  final List<DailyCallData> data;
  const _DailyChart({required this.data});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxVal =
        data.map((e) => e.total).fold(1, (a, b) => a > b ? a : b);

    return LayoutBuilder(builder: (context, constraints) {
      final barWidth =
          (constraints.maxWidth / data.length).clamp(4.0, 16.0);
      return Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: data.map((d) {
          final height = maxVal > 0 ? (d.total / maxVal) * 140 : 0.0;
          return Tooltip(
            message: '${d.date}: ${d.total} calls',
            child: Container(
              width: barWidth,
              height: height.clamp(2.0, 140.0),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }).toList(),
      );
    });
  }
}

class _HourlyChart extends StatelessWidget {
  final List<HourlyData> data;
  const _HourlyChart({required this.data});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxVal =
        data.map((e) => e.count).fold(1, (a, b) => a > b ? a : b);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: List.generate(24, (hour) {
        final entry = data.where((d) => d.hour == hour).firstOrNull;
        final count = entry?.count ?? 0;
        final height = maxVal > 0 ? (count / maxVal) * 100 : 0.0;
        return Tooltip(
          message: '${hour.toString().padLeft(2, '0')}:00 — $count calls',
          child: Container(
            width: 8,
            height: height.clamp(2.0, 100.0),
            decoration: BoxDecoration(
              color: count > 0
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
    );
  }
}
