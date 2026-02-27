import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/fleet_provider.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_state.dart';

class VehicleRateCardListScreen extends ConsumerStatefulWidget {
  const VehicleRateCardListScreen({super.key});

  @override
  ConsumerState<VehicleRateCardListScreen> createState() =>
      _VehicleRateCardListScreenState();
}

class _VehicleRateCardListScreenState
    extends ConsumerState<VehicleRateCardListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(rateCardListProvider.notifier).load(refresh: true);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  static const _vehicleTypes = {
    'sedan': 'Sedan',
    'suv': 'SUV',
    'muv': 'MUV',
    'tempo_traveller': 'Tempo Traveller',
    'mini_bus': 'Mini Bus',
    'bus': 'Bus',
    'luxury_coach': 'Luxury Coach',
  };

  static const _tripTypes = {
    'one_way': 'One Way',
    'round_trip': 'Round Trip',
    'airport_pickup': 'Airport Pickup',
    'airport_drop': 'Airport Drop',
    'local_8h80km': 'Local 8hr/80km',
    'local_12h120km': 'Local 12hr/120km',
    'outstation': 'Outstation',
  };

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(rateCardListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Vehicle Rate Cards'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Rate Card',
            onPressed: () => context.push('/fleet/rate-cards/new'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search + Filters
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search rate cards...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              ref
                                  .read(rateCardListProvider.notifier)
                                  .setSearch('');
                            },
                          )
                        : null,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  onChanged: (v) =>
                      ref.read(rateCardListProvider.notifier).setSearch(v),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: state.vehicleTypeFilter,
                        decoration: InputDecoration(
                          labelText: 'Vehicle Type',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding:
                              const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        items: [
                          const DropdownMenuItem(
                              value: null, child: Text('All Types')),
                          ..._vehicleTypes.entries.map((e) =>
                              DropdownMenuItem(
                                  value: e.key, child: Text(e.value))),
                        ],
                        onChanged: (v) => ref
                            .read(rateCardListProvider.notifier)
                            .setVehicleTypeFilter(v),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: state.tripTypeFilter,
                        decoration: InputDecoration(
                          labelText: 'Trip Type',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding:
                              const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        items: [
                          const DropdownMenuItem(
                              value: null, child: Text('All Trips')),
                          ..._tripTypes.entries.map((e) => DropdownMenuItem(
                              value: e.key, child: Text(e.value))),
                        ],
                        onChanged: (v) => ref
                            .read(rateCardListProvider.notifier)
                            .setTripTypeFilter(v),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // List
          Expanded(child: _buildBody(state)),
        ],
      ),
    );
  }

  Widget _buildBody(RateCardListState state) {
    if (state.status == FleetListStatus.loading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.status == FleetListStatus.error && state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(state.error ?? 'Failed to load rate cards'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () =>
                  ref.read(rateCardListProvider.notifier).load(refresh: true),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (state.items.isEmpty) {
      return AppEmptyState(
        icon: Icons.price_change_outlined,
        title: 'No Rate Cards',
        subtitle: 'Create rate cards to price trips by vehicle type',
        actionLabel: 'Add Rate Card',
        onAction: () => context.push('/fleet/rate-cards/new'),
      );
    }

    return RefreshIndicator(
      onRefresh: () =>
          ref.read(rateCardListProvider.notifier).load(refresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.items.length,
        itemBuilder: (context, index) {
          final card = state.items[index];
          return _RateCardTile(
            card: card,
            onTap: () =>
                context.push('/fleet/rate-cards/${card.id}/edit'),
            onDelete: () => _confirmDelete(card),
          );
        },
      ),
    );
  }

  void _confirmDelete(VehicleRateCardModel card) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Rate Card'),
        content: Text('Delete "${card.name}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref
                    .read(fleetRepositoryProvider)
                    .deleteVehicleRateCard(card.id);
                ref.read(rateCardListProvider.notifier).load(refresh: true);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rate card deleted')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e')),
                  );
                }
              }
            },
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _RateCardTile extends StatelessWidget {
  final VehicleRateCardModel card;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _RateCardTile({
    required this.card,
    required this.onTap,
    required this.onDelete,
  });

  static const _vehicleTypes = {
    'sedan': 'Sedan',
    'suv': 'SUV',
    'muv': 'MUV',
    'tempo_traveller': 'Tempo Traveller',
    'mini_bus': 'Mini Bus',
    'bus': 'Bus',
    'luxury_coach': 'Luxury Coach',
  };

  static const _tripTypes = {
    'one_way': 'One Way',
    'round_trip': 'Round Trip',
    'airport_pickup': 'Airport Pickup',
    'airport_drop': 'Airport Drop',
    'local_8h80km': 'Local 8hr/80km',
    'local_12h120km': 'Local 12hr/120km',
    'outstation': 'Outstation',
  };

  @override
  Widget build(BuildContext context) {
    final isFlat = card.flatRate != null && card.flatRate! > 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        title: Text(card.name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Row(
              children: [
                _Chip(
                  label: _vehicleTypes[card.vehicleType] ?? card.vehicleType,
                  color: Colors.blue,
                ),
                const SizedBox(width: 6),
                _Chip(
                  label: _tripTypes[card.tripType] ?? card.tripType,
                  color: Colors.orange,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              isFlat
                  ? 'Flat Rate: ${card.currency} ${card.flatRate!.toStringAsFixed(0)}'
                  : 'Base: ${card.currency} ${card.baseFare.toStringAsFixed(0)} | Per km: ${card.perKmRate.toStringAsFixed(1)}',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!card.isActive)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text('Inactive',
                    style: TextStyle(fontSize: 11, color: Colors.red)),
              ),
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20),
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;

  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: TextStyle(fontSize: 11, color: color)),
    );
  }
}
