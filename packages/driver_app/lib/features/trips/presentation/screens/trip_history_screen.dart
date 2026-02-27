import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../data/trip_provider.dart';
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
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
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
                style: TextStyle(color: Colors.grey[600], fontSize: 13),
              ),
            ),
          ),
          const SizedBox(height: 4),
          // Trip list
          Expanded(
            child: state.isLoading && state.trips.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _buildList(state, l10n),
          ),
        ],
      ),
    );
  }

  Widget _buildList(dynamic state, AppLocalizations l10n) {
    final trips = _filteredTrips(state.trips as List<Map<String, dynamic>>);

    if (trips.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              l10n.noPastTrips,
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(tripListProvider('past').notifier).refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: trips.length,
        itemBuilder: (context, index) => TripCard(trip: trips[index]),
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
          final dt = DateTime.tryParse(t['pickupDatetime'] ?? '');
          return dt != null && dt.isAfter(cutoff);
        }).toList();
      case DateFilter.last30:
        final cutoff = now.subtract(const Duration(days: 30));
        filtered = filtered.where((t) {
          final dt = DateTime.tryParse(t['pickupDatetime'] ?? '');
          return dt != null && dt.isAfter(cutoff);
        }).toList();
      case DateFilter.thisMonth:
        filtered = filtered.where((t) {
          final dt = DateTime.tryParse(t['pickupDatetime'] ?? '');
          return dt != null && dt.month == now.month && dt.year == now.year;
        }).toList();
      case DateFilter.allTime:
        break;
    }

    // Search filter
    final query = _searchController.text.trim().toLowerCase();
    if (query.isNotEmpty) {
      filtered = filtered.where((t) {
        final pickup = (t['pickupLocation'] ?? '').toString().toLowerCase();
        final drop = (t['dropLocation'] ?? '').toString().toLowerCase();
        final passenger = (t['passengerName'] ?? '').toString().toLowerCase();
        return pickup.contains(query) ||
            drop.contains(query) ||
            passenger.contains(query);
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
