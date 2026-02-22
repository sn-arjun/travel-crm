import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../auth/data/auth_provider.dart';
import 'data/dashboard_provider.dart';
import 'widgets/pipeline_summary_widget.dart';
import 'widgets/hot_leads_widget.dart';
import 'widgets/todays_followups_widget.dart';
import 'widgets/recent_activity_widget.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final theme = Theme.of(context);
    final statsAsync = ref.watch(dashboardStatsProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Welcome Header ────────────────────────────────
          Text(
            'Welcome back, ${user?.name ?? 'User'}!',
            style: theme.textTheme.headlineSmall
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            "Here's what's happening today.",
            style: theme.textTheme.bodyLarge
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // ── Stats Row ─────────────────────────────────────
          statsAsync.when(
            loading: () => const _StatsRowLoading(),
            error: (_, _) => const _StatsRowLoading(),
            data: (stats) {
              final activeLeads = stats.pipelineCounts.entries
                  .where((e) =>
                      !['lost', 'completed'].contains(e.key))
                  .fold(0, (sum, e) => sum + e.value);
              return LayoutBuilder(
                builder: (context, constraints) {
                  final crossCount = constraints.maxWidth > 900
                      ? 4
                      : constraints.maxWidth > 600
                          ? 2
                          : 1;
                  return GridView.count(
                    crossAxisCount: crossCount,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: AppTheme.spacingMd,
                    crossAxisSpacing: AppTheme.spacingMd,
                    childAspectRatio: 2.5,
                    children: [
                      _StatCard(
                        title: 'Active Leads',
                        value: '$activeLeads',
                        icon: Icons.leaderboard,
                        color: Colors.blue,
                        onTap: () => context.go('/leads'),
                      ),
                      _StatCard(
                        title: "Today's Follow-ups",
                        value: '${stats.todayFollowUpCount}',
                        icon: Icons.schedule,
                        color: Colors.orange,
                        onTap: () => context.go('/follow-ups'),
                      ),
                      _StatCard(
                        title: 'Overdue Follow-ups',
                        value: '${stats.overdueFollowUpCount}',
                        icon: Icons.warning_amber_rounded,
                        color: stats.overdueFollowUpCount > 0
                            ? Colors.red
                            : Colors.green,
                        onTap: () => context.go('/follow-ups'),
                      ),
                      _StatCard(
                        title: 'Hot Leads',
                        value: '${stats.hotLeads.length}',
                        icon: Icons.local_fire_department,
                        color: Colors.deepOrange,
                        onTap: () => context.go('/leads'),
                      ),
                    ],
                  );
                },
              );
            },
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // ── Quick Actions ─────────────────────────────────
          Text(
            'Quick Actions',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _QuickAction(
                icon: Icons.person_add,
                label: 'New Contact',
                onTap: () => context.push('/contacts/new'),
              ),
              _QuickAction(
                icon: Icons.add_chart,
                label: 'New Lead',
                onTap: () => context.push('/leads/new'),
              ),
              _QuickAction(
                icon: Icons.event,
                label: 'My Follow-Ups',
                onTap: () => context.go('/follow-ups'),
              ),
              _QuickAction(
                icon: Icons.receipt_long,
                label: 'New Invoice',
                onTap: () {},
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // ── Dashboard Widgets ─────────────────────────────
          statsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (stats) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PipelineSummaryWidget(
                    pipelineCounts: stats.pipelineCounts),
                const SizedBox(height: AppTheme.spacingLg),
                LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth > 900) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                              child: HotLeadsWidget(
                                  hotLeads: stats.hotLeads)),
                          const SizedBox(width: AppTheme.spacingMd),
                          Expanded(
                              child: TodaysFollowUpsWidget(
                                  todayCount: stats.todayFollowUpCount, overdueCount: stats.overdueFollowUpCount)),
                        ],
                      );
                    }
                    return Column(
                      children: [
                        HotLeadsWidget(hotLeads: stats.hotLeads),
                        const SizedBox(height: AppTheme.spacingMd),
                        TodaysFollowUpsWidget(
                            todayCount: stats.todayFollowUpCount, overdueCount: stats.overdueFollowUpCount),
                      ],
                    );
                  },
                ),
                const SizedBox(height: AppTheme.spacingLg),
                RecentActivityWidget(
                    activities: stats.recentActivities),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Loading skeleton ──────────────────────────────────────

class _StatsRowLoading extends StatelessWidget {
  const _StatsRowLoading();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossCount = constraints.maxWidth > 900
            ? 4
            : constraints.maxWidth > 600
                ? 2
                : 1;
        return GridView.count(
          crossAxisCount: crossCount,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: AppTheme.spacingMd,
          crossAxisSpacing: AppTheme.spacingMd,
          childAspectRatio: 2.5,
          children: const [
            _StatCard(title: 'Active Leads', value: '—', icon: Icons.leaderboard, color: Colors.blue),
            _StatCard(title: "Today's Follow-ups", value: '—', icon: Icons.schedule, color: Colors.orange),
            _StatCard(title: 'Overdue Follow-ups', value: '—', icon: Icons.warning_amber_rounded, color: Colors.red),
            _StatCard(title: 'Hot Leads', value: '—', icon: Icons.local_fire_department, color: Colors.deepOrange),
          ],
        );
      },
    );
  }
}

// ── Reusable stat card ────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: AppTheme.spacingMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      value,
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      onPressed: onTap,
    );
  }
}
