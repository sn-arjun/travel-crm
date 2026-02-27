import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/fleet_provider.dart';
import '../../data/fleet_state.dart';

class TripListScreen extends ConsumerStatefulWidget {
  const TripListScreen({super.key});
  @override
  ConsumerState<TripListScreen> createState() => _TripListScreenState();
}

class _TripListScreenState extends ConsumerState<TripListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(tripListProvider.notifier).load(refresh: true);
    });
  }

  @override
  void dispose() { _searchController.dispose(); super.dispose(); }

  Color _statusColor(String status) {
    switch (status) {
      case 'assigned': return Colors.grey;
      case 'accepted': return Colors.blue;
      case 'en_route': return Colors.indigo;
      case 'started': return Colors.green;
      case 'completed': return Colors.teal;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripListProvider);
    return Column(children: [
      Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Search by passenger, vehicle, driver...',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _searchController.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchController.clear(); ref.read(tripListProvider.notifier).setSearch(''); }) : null,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          ),
          onChanged: (v) => ref.read(tripListProvider.notifier).setSearch(v),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
          _chip(null, 'All', state.statusFilter),
          const SizedBox(width: 8),
          _chip('assigned', 'Assigned', state.statusFilter),
          const SizedBox(width: 8),
          _chip('accepted', 'Accepted', state.statusFilter),
          const SizedBox(width: 8),
          _chip('en_route', 'En Route', state.statusFilter),
          const SizedBox(width: 8),
          _chip('started', 'Started', state.statusFilter),
          const SizedBox(width: 8),
          _chip('completed', 'Completed', state.statusFilter),
          const SizedBox(width: 8),
          _chip('cancelled', 'Cancelled', state.statusFilter),
        ])),
      ])),
      Expanded(child: _body(state)),
      Padding(padding: const EdgeInsets.all(16), child: SizedBox(width: double.infinity, child: FilledButton.icon(
        onPressed: () => context.push('/fleet/trips/new'),
        icon: const Icon(Icons.add),
        label: const Text('New Trip'),
      ))),
    ]);
  }

  Widget _chip(String? v, String label, String? current) =>
      FilterChip(label: Text(label), selected: current == v, onSelected: (_) => ref.read(tripListProvider.notifier).setStatusFilter(v));

  Widget _body(TripListState state) {
    if (state.status == FleetListStatus.loading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.status == FleetListStatus.error && state.items.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(state.error ?? 'Failed to load'), const SizedBox(height: 16),
        FilledButton(onPressed: () => ref.read(tripListProvider.notifier).load(refresh: true), child: const Text('Retry')),
      ]));
    }
    if (state.items.isEmpty) {
      return AppEmptyState(icon: Icons.route, title: 'No trips found',
        subtitle: state.search.isNotEmpty || state.statusFilter != null ? 'Try adjusting your filters' : 'Create your first trip assignment');
    }
    return RefreshIndicator(
      onRefresh: () => ref.read(tripListProvider.notifier).load(refresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.items.length + (state.pagination?.hasMore == true ? 1 : 0),
        itemBuilder: (ctx, i) {
          if (i >= state.items.length) {
            WidgetsBinding.instance.addPostFrameCallback((_) { ref.read(tripListProvider.notifier).loadNextPage(); });
            return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
          }
          final trip = state.items[i];
          return Card(margin: const EdgeInsets.only(bottom: 12), child: InkWell(
            onTap: () => context.push('/fleet/trips/${trip.id}'),
            borderRadius: BorderRadius.circular(12),
            child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(trip.passengerName ?? 'No passenger', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold))),
                Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: _statusColor(trip.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
                  child: Text(trip.status.replaceAll('_', ' ').toUpperCase(), style: TextStyle(color: _statusColor(trip.status), fontSize: 11, fontWeight: FontWeight.w600))),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.my_location, size: 14, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Expanded(child: Text('${trip.pickupLocation ?? '-'} → ${trip.dropLocation ?? '-'}', style: TextStyle(color: Colors.grey[600], fontSize: 13))),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                Icon(Icons.access_time, size: 14, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(trip.pickupDatetime?.substring(0, 16).replaceAll('T', ' ') ?? '-', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
              ]),
              const Divider(height: 16),
              Row(children: [
                Icon(Icons.directions_car, size: 14, color: Colors.blue[600]),
                const SizedBox(width: 4),
                Text(trip.vehicleRegistration ?? '-', style: const TextStyle(fontSize: 13)),
                const SizedBox(width: 16),
                Icon(Icons.person, size: 14, color: Colors.green[600]),
                const SizedBox(width: 4),
                Text(trip.driverName ?? '-', style: const TextStyle(fontSize: 13)),
              ]),
            ])),
          ));
        },
      ),
    );
  }
}
