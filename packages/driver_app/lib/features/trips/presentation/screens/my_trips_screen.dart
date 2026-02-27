import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../data/trip_provider.dart';
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
            Tab(text: l10n.today),
            Tab(text: l10n.upcoming),
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

    if (state.isLoading && state.trips.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.trips.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.directions_car_outlined,
                size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              _emptyMessage(tab, l10n),
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(tripListProvider(tab).notifier).refresh(),
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification is ScrollEndNotification &&
              notification.metrics.extentAfter < 200) {
            ref.read(tripListProvider(tab).notifier).loadMore();
          }
          return false;
        },
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: state.trips.length + (state.hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index >= state.trips.length) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            return TripCard(trip: state.trips[index]);
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
