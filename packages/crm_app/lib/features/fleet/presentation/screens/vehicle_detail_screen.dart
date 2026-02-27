import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_provider.dart';

class VehicleDetailScreen extends ConsumerStatefulWidget {
  final String vehicleId;
  const VehicleDetailScreen({super.key, required this.vehicleId});

  @override
  ConsumerState<VehicleDetailScreen> createState() => _VehicleDetailScreenState();
}

class _VehicleDetailScreenState extends ConsumerState<VehicleDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final repo = ref.read(fleetRepositoryProvider);
      final data = await repo.getVehicleDetail(widget.vehicleId);
      if (!mounted) return;
      setState(() { _data = data; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'available': return Colors.green;
      case 'on_trip': return Colors.blue;
      case 'under_maintenance': return Colors.orange;
      case 'out_of_service': return Colors.red;
      default: return Colors.grey;
    }
  }

  Color _expiryColor(int? days) {
    if (days == null) return Colors.grey;
    if (days < 0) return Colors.red;
    if (days <= 7) return Colors.red;
    if (days <= 30) return Colors.orange;
    return Colors.green;
  }

  Future<void> _changeStatus(String newStatus) async {
    try {
      final repo = ref.read(fleetRepositoryProvider);
      await repo.updateVehicleStatus(widget.vehicleId, newStatus);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Status updated'), backgroundColor: Colors.green));
      _loadData();
      ref.read(vehicleListProvider.notifier).load(refresh: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    if (_data == null) return const Center(child: Text('Not found'));

    final status = _data!['status'] ?? 'available';
    final docs = (_data!['documents'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final upcomingTrips = (_data!['upcomingTrips'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: Colors.blue.shade100,
                child: Icon(Icons.directions_car, size: 32, color: Colors.blue.shade700),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_data!['registrationNumber'] ?? '', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                    Text('${_data!['type']}${_data!['make'] != null ? ' - ${_data!['make']}' : ''}${_data!['model'] != null ? ' ${_data!['model']}' : ''}'),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: _changeStatus,
                itemBuilder: (ctx) => [
                  const PopupMenuItem(value: 'available', child: Text('Available')),
                  const PopupMenuItem(value: 'under_maintenance', child: Text('Under Maintenance')),
                  const PopupMenuItem(value: 'out_of_service', child: Text('Out of Service')),
                ],
                child: Chip(
                  label: Text(status.replaceAll('_', ' ').toUpperCase(), style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.bold, fontSize: 12)),
                  backgroundColor: _statusColor(status).withValues(alpha: 0.1),
                ),
              ),
            ],
          ),
        ),
        // Info row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _InfoChip(icon: Icons.event_seat, label: '${_data!['seatingCapacity'] ?? '-'} seats'),
              _InfoChip(icon: Icons.speed, label: '${_data!['odometerKm'] ?? '-'} km'),
              if (_data!['year'] != null) _InfoChip(icon: Icons.calendar_today, label: '${_data!['year']}'),
              if (_data!['color'] != null) _InfoChip(icon: Icons.palette, label: '${_data!['color']}'),
            ],
          ),
        ),
        // Tabs
        TabBar(controller: _tabController, tabs: const [
          Tab(text: 'Documents'),
          Tab(text: 'Maintenance'),
          Tab(text: 'Trips'),
          Tab(text: 'Info'),
        ]),
        Expanded(
          child: TabBarView(controller: _tabController, children: [
            // Documents tab
            docs.isEmpty
                ? const Center(child: Text('No documents'))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: docs.length,
                    itemBuilder: (ctx, i) {
                      final doc = docs[i];
                      final days = doc['daysUntilExpiry'] as int?;
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: _expiryColor(days).withValues(alpha: 0.1),
                            child: Icon(Icons.description, color: _expiryColor(days)),
                          ),
                          title: Text((doc['type'] as String).toUpperCase()),
                          subtitle: Text('Expires: ${doc['expiryDate'] ?? 'N/A'}${days != null ? ' (${days < 0 ? '${-days}d overdue' : '${days}d left'})' : ''}'),
                          trailing: doc['documentNumber'] != null ? Text(doc['documentNumber']) : null,
                        ),
                      );
                    },
                  ),
            // Maintenance tab
            FutureBuilder<List<Map<String, dynamic>>>(
              future: ref.read(fleetRepositoryProvider).getVehicleMaintenance(widget.vehicleId),
              builder: (ctx, snap) {
                if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
                final items = snap.data ?? [];
                if (items.isEmpty) return const Center(child: Text('No maintenance records'));
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  itemBuilder: (ctx, i) {
                    final m = items[i];
                    return Card(
                      child: ListTile(
                        leading: const CircleAvatar(child: Icon(Icons.build)),
                        title: Text((m['service_type'] ?? '').toString().replaceAll('_', ' ')),
                        subtitle: Text('${m['service_date'] ?? ''}${m['cost'] != null ? ' - \u20B9${m['cost']}' : ''}'),
                        trailing: m['vendor_name'] != null ? Text(m['vendor_name'].toString()) : null,
                      ),
                    );
                  },
                );
              },
            ),
            // Trips tab
            upcomingTrips.isEmpty
                ? const Center(child: Text('No upcoming trips'))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: upcomingTrips.length,
                    itemBuilder: (ctx, i) {
                      final trip = upcomingTrips[i];
                      return Card(
                        child: ListTile(
                          leading: const CircleAvatar(child: Icon(Icons.route)),
                          title: Text(trip['passengerName'] ?? 'No passenger'),
                          subtitle: Text('${trip['pickupLocation'] ?? ''} \u2192 ${trip['dropLocation'] ?? ''}\n${trip['pickupDatetime'] ?? ''}'),
                          isThreeLine: true,
                          trailing: Chip(label: Text(trip['status'] ?? '')),
                          onTap: () => context.push('/fleet/trips/${trip['id']}'),
                        ),
                      );
                    },
                  ),
            // Info tab
            SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _DetailRow('Registration', _data!['registrationNumber']),
                  _DetailRow('Type', _data!['type']),
                  _DetailRow('Make', _data!['make']),
                  _DetailRow('Model', _data!['model']),
                  _DetailRow('Year', _data!['year']?.toString()),
                  _DetailRow('Capacity', _data!['seatingCapacity']?.toString()),
                  _DetailRow('Color', _data!['color']),
                  _DetailRow('Odometer', _data!['odometerKm'] != null ? '${_data!['odometerKm']} km' : null),
                  _DetailRow('Last Service', _data!['lastServiceDate']),
                  _DetailRow('Next Service Due', _data!['nextServiceDue']),
                  _DetailRow('Notes', _data!['notes']),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => context.push('/fleet/vehicles/${widget.vehicleId}/edit'),
                          icon: const Icon(Icons.edit),
                          label: const Text('Edit'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoChip({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 20, color: Colors.grey[600]),
      const SizedBox(height: 4),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String? value;
  const _DetailRow(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 140, child: Text(label, style: TextStyle(color: Colors.grey[600]))),
        Expanded(child: Text(value ?? '-', style: const TextStyle(fontWeight: FontWeight.w500))),
      ],
    ),
  );
}
