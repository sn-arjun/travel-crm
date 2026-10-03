import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../data/trip_provider.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../widgets/trip_card.dart';

class MyTripsScreen extends ConsumerStatefulWidget {
  const MyTripsScreen({super.key});

  @override
  ConsumerState<MyTripsScreen> createState() => _MyTripsScreenState();
}

class _MyTripsScreenState extends ConsumerState<MyTripsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  Timer? _autoRefreshTimer;

  static const _tabs = ['today', 'upcoming', 'past'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_onTabChanged);
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _autoRefreshTimer?.cancel();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    _autoRefreshTimer?.cancel();
    if (_tabController.index == 0) {
      _startAutoRefresh();
    }
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      ref.read(tripListProvider('today').notifier).refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myTrips),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(key: const Key('tab-today'), text: l10n.today),
            Tab(key: const Key('tab-upcoming'), text: l10n.upcoming),
            Tab(text: l10n.past),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: _tabs.map((tab) => _TripTabView(tab: tab)).toList(),
      ),
    );
  }
}

class _TripTabView extends ConsumerWidget {
  final String tab;

  const _TripTabView({required this.tab});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(tripListProvider(tab));
    final notifier = ref.read(tripListProvider(tab).notifier);

    if (state.isLoading && state.trips.isEmpty) {
      return const TripListSkeleton();
    }

    if (state.trips.isEmpty) {
      final failed = state.error != null;
      return RefreshIndicator(
        onRefresh: notifier.refresh,
        child: failed
            ? StateMessage(
                key: Key('trips-error-$tab'),
                icon: Icons.cloud_off_outlined,
                isError: true,
                title: l10n.tripsLoadError,
                message: state.error,
                actionLabel: l10n.retry,
                onAction: notifier.refresh,
              )
            : StateMessage(
                key: Key('trips-empty-$tab'),
                icon: Icons.directions_car_outlined,
                title: _emptyMessage(tab, l10n),
                message: l10n.emptyTripsHint,
                actionLabel: l10n.refresh,
                onAction: notifier.refresh,
              ),
      );
    }

    // Trips are showing but the last request failed (e.g. offline cache).
    final showNotice = state.error != null;
    final headerCount = showNotice ? 1 : 0;

    return RefreshIndicator(
      onRefresh: notifier.refresh,
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification is ScrollEndNotification &&
              notification.metrics.extentAfter < 200) {
            notifier.loadMore();
          }
          return false;
        },
        child: ListView.separated(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          itemCount: headerCount + state.trips.length + (state.hasMore ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            if (showNotice && index == 0) {
              return InfoBanner(
                key: Key('trips-notice-$tab'),
                icon: Icons.cloud_off_outlined,
                message: l10n.showingSavedTrips,
              );
            }
            final tripIndex = index - headerCount;
            if (tripIndex >= state.trips.length) {
              return const Padding(
                padding: EdgeInsets.all(8),
                child: Center(
                  child: SizedBox(
                    height: 24,
                    width: 24,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                ),
              );
            }
            return TripCard(trip: state.trips[tripIndex]);
          },
        ),
      ),
    );
  }

  String _emptyMessage(String tab, AppLocalizations l10n) {
    switch (tab) {
      case 'today':
        return l10n.noTripsToday;
      case 'upcoming':
        return l10n.noUpcomingTrips;
      case 'past':
        return l10n.noPastTrips;
      default:
        return '';
    }
  }
}
