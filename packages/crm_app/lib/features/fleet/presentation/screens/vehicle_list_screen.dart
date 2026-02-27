import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/fleet_provider.dart';
import '../../data/fleet_state.dart';

class VehicleListScreen extends ConsumerStatefulWidget {
  const VehicleListScreen({super.key});

  @override
  ConsumerState<VehicleListScreen> createState() => _VehicleListScreenState();
}

class _VehicleListScreenState extends ConsumerState<VehicleListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(vehicleListProvider.notifier).load(refresh: true);
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

  Color _statusColor(String status) {
    switch (status) {
      case 'available': return Colors.green;
      case 'on_trip': return Colors.blue;
      case 'under_maintenance': return Colors.orange;
      case 'out_of_service': return Colors.red;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'available': return 'Available';
      case 'on_trip': return 'On Trip';
      case 'under_maintenance': return 'Maintenance';
      case 'out_of_service': return 'Out of Service';
      default: return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(vehicleListProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search by registration, make, model...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            ref.read(vehicleListProvider.notifier).setSearch('');
                          },
                        )
                      : null,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                ),
                onChanged: (v) => ref.read(vehicleListProvider.notifier).setSearch(v),
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildStatusChip(null, 'All', state.statusFilter),
                    const SizedBox(width: 8),
                    _buildStatusChip('available', 'Available', state.statusFilter),
                    const SizedBox(width: 8),
                    _buildStatusChip('on_trip', 'On Trip', state.statusFilter),
                    const SizedBox(width: 8),
                    _buildStatusChip('under_maintenance', 'Maintenance', state.statusFilter),
                    const SizedBox(width: 8),
                    _buildStatusChip('out_of_service', 'Out of Service', state.statusFilter),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody(state)),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => context.push('/fleet/vehicles/new'),
              icon: const Icon(Icons.add),
              label: const Text('Add Vehicle'),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusChip(String? value, String label, String? current) {
    final selected = current == value;
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => ref.read(vehicleListProvider.notifier).setStatusFilter(value),
    );
  }

  Widget _buildBody(VehicleListState state) {
    if (state.status == FleetListStatus.loading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.status == FleetListStatus.error && state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(state.error ?? 'Failed to load vehicles'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => ref.read(vehicleListProvider.notifier).load(refresh: true),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }
    if (state.items.isEmpty) {
      return AppEmptyState(
        icon: Icons.directions_car_outlined,
        title: 'No vehicles found',
        subtitle: state.search.isNotEmpty || state.statusFilter != null
            ? 'Try adjusting your filters'
            : 'Add your first vehicle to get started',
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(vehicleListProvider.notifier).load(refresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.items.length + (state.pagination?.hasMore == true ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= state.items.length) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              ref.read(vehicleListProvider.notifier).loadNextPage();
            });
            return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
          }
          final vehicle = state.items[index];
          return _VehicleCard(
            vehicle: vehicle,
            statusColor: _statusColor(vehicle.status),
            statusLabel: _statusLabel(vehicle.status),
            typeLabel: _vehicleTypes[vehicle.type] ?? vehicle.type,
            onTap: () => context.push('/fleet/vehicles/${vehicle.id}'),
          );
        },
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  final VehicleModel vehicle;
  final Color statusColor;
  final String statusLabel;
  final String typeLabel;
  final VoidCallback onTap;

  const _VehicleCard({
    required this.vehicle,
    required this.statusColor,
    required this.statusLabel,
    required this.typeLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: Colors.blue.shade50,
                child: Icon(Icons.directions_car, color: Colors.blue.shade700),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vehicle.registrationNumber,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$typeLabel${vehicle.make != null ? ' - ${vehicle.make}' : ''}${vehicle.model != null ? ' ${vehicle.model}' : ''}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600]),
                    ),
                    if (vehicle.seatingCapacity != null) ...[
                      const SizedBox(height: 2),
                      Text('${vehicle.seatingCapacity} seats', style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(statusLabel, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
