import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../data/trip_provider.dart';
import '../../data/trip_state.dart';
import '../../data/trip_view.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../widgets/trip_card.dart';

enum DateFilter { last7, last30, thisMonth, allTime }

class TripHistoryScreen extends ConsumerStatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  ConsumerState<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends ConsumerState<TripHistoryScreen> {
  DateFilter _filter = DateFilter.allTime;
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(tripListProvider('past'));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.history),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchTrips,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                isDense: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          // Filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _FilterChip(
                  label: l10n.last7Days,
                  selected: _filter == DateFilter.last7,
                  onTap: () => setState(() => _filter = DateFilter.last7),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: l10n.last30Days,
                  selected: _filter == DateFilter.last30,
                  onTap: () => setState(() => _filter = DateFilter.last30),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: l10n.thisMonth,
                  selected: _filter == DateFilter.thisMonth,
                  onTap: () =>
                      setState(() => _filter = DateFilter.thisMonth),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: l10n.allTime,
                  selected: _filter == DateFilter.allTime,
                  onTap: () => setState(() => _filter = DateFilter.allTime),
                ),
              ],
            ),
          ),
          // Trip count
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                l10n.tripCount(_filteredTrips(state.trips).length),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          // Trip list
          Expanded(
            child: state.isLoading && state.trips.isEmpty
                ? const TripListSkeleton()
                : _buildList(state, l10n),
          ),
        ],
      ),
    );
  }

  Widget _buildList(TripListState state, AppLocalizations l10n) {
    final notifier = ref.read(tripListProvider('past').notifier);
    final trips = _filteredTrips(state.trips);

    if (state.trips.isEmpty && state.error != null) {
      return RefreshIndicator(
        onRefresh: notifier.refresh,
        child: StateMessage(
          key: const Key('history-error'),
          icon: Icons.cloud_off_outlined,
          isError: true,
          title: l10n.tripsLoadError,
          message: state.error,
          actionLabel: l10n.retry,
          onAction: notifier.refresh,
        ),
      );
    }

    if (trips.isEmpty) {
      final filtering = state.trips.isNotEmpty;
      return RefreshIndicator(
        onRefresh: notifier.refresh,
        child: StateMessage(
          key: const Key('history-empty'),
          icon: filtering ? Icons.search_off : Icons.history,
          title: filtering ? l10n.noMatchingTrips : l10n.noPastTrips,
          message: filtering ? l10n.tryDifferentFilter : l10n.emptyTripsHint,
          actionLabel: filtering ? null : l10n.refresh,
          onAction: filtering ? null : notifier.refresh,
        ),
      );
    }

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
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
          itemCount: trips.length,
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (context, index) => TripCard(trip: trips[index]),
        ),
      ),
    );
  }

  List<Map<String, dynamic>> _filteredTrips(List<Map<String, dynamic>> trips) {
    var filtered = trips;

    // Date filter
    final now = DateTime.now();
    switch (_filter) {
      case DateFilter.last7:
        final cutoff = now.subtract(const Duration(days: 7));
        filtered = filtered.where((t) {
          final dt = t.view.pickupAt;
          return dt != null && dt.isAfter(cutoff);
        }).toList();
      case DateFilter.last30:
        final cutoff = now.subtract(const Duration(days: 30));
        filtered = filtered.where((t) {
          final dt = t.view.pickupAt;
          return dt != null && dt.isAfter(cutoff);
        }).toList();
      case DateFilter.thisMonth:
        filtered = filtered.where((t) {
          final dt = t.view.pickupAt;
          return dt != null && dt.month == now.month && dt.year == now.year;
        }).toList();
      case DateFilter.allTime:
        break;
    }

    // Search filter
    final query = _searchController.text.trim().toLowerCase();
    if (query.isNotEmpty) {
      filtered = filtered.where((t) {
        final v = t.view;
        return v.pickupLocation.toLowerCase().contains(query) ||
            v.dropLocation.toLowerCase().contains(query) ||
            (v.passengerName ?? '').toLowerCase().contains(query) ||
            (v.vehicleRegistration ?? '').toLowerCase().contains(query);
      }).toList();
    }

    return filtered;
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}
