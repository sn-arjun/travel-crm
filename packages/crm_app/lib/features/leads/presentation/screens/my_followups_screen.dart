import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../data/followup_provider.dart';
import '../widgets/followup_card.dart';

class MyFollowUpsScreen extends ConsumerStatefulWidget {
  const MyFollowUpsScreen({super.key});

  @override
  ConsumerState<MyFollowUpsScreen> createState() => _MyFollowUpsScreenState();
}

class _MyFollowUpsScreenState extends ConsumerState<MyFollowUpsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(myFollowUpsProvider.notifier).loadAll();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(myFollowUpsProvider);
    final overdueCount = state.overdueCount;

    return Column(
      children: [
        TabBar(
          controller: _tabController,
          tabs: [
            const Tab(text: 'Today'),
            const Tab(text: 'Upcoming'),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Overdue'),
                  if (overdueCount > 0) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.error,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '$overdueCount',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onError,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _FollowUpList(
                items: state.todayItems,
                loading: state.loading[FollowUpTab.today] ?? false,
                emptyMessage: 'No follow-ups scheduled for today',
              ),
              _FollowUpList(
                items: state.upcomingItems,
                loading: state.loading[FollowUpTab.upcoming] ?? false,
                emptyMessage: 'No upcoming follow-ups in the next 7 days',
              ),
              _FollowUpList(
                items: state.overdueItems,
                loading: state.loading[FollowUpTab.overdue] ?? false,
                emptyMessage: 'No overdue follow-ups',
                isOverdue: true,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FollowUpList extends ConsumerWidget {
  final List<dynamic> items;
  final bool loading;
  final String emptyMessage;
  final bool isOverdue;

  const _FollowUpList({
    required this.items,
    required this.loading,
    required this.emptyMessage,
    this.isOverdue = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (loading && items.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingXl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isOverdue
                    ? Icons.check_circle_outline
                    : Icons.event_available_outlined,
                size: 48,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.3),
              ),
              const SizedBox(height: AppTheme.spacingMd),
              Text(
                emptyMessage,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref
          .read(myFollowUpsProvider.notifier)
          .loadTab(isOverdue ? FollowUpTab.overdue : FollowUpTab.today),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        itemCount: items.length,
        separatorBuilder: (_, _) =>
            const SizedBox(height: AppTheme.spacingSm),
        itemBuilder: (context, i) => FollowUpCard(followUp: items[i]),
      ),
    );
  }
}
