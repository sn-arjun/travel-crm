import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_repository.dart';

class FleetAlertsScreen extends ConsumerStatefulWidget {
  const FleetAlertsScreen({super.key});
  @override
  ConsumerState<FleetAlertsScreen> createState() => _FleetAlertsScreenState();
}

class _FleetAlertsScreenState extends ConsumerState<FleetAlertsScreen> {
  List<Map<String, dynamic>> _expiringDocs = [];
  List<Map<String, dynamic>> _maintenanceDue = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final repo = ref.read(fleetRepositoryProvider);
      final docs = await repo.getExpiringDocuments(days: 60);
      final maintenance = await repo.getMaintenanceDue(days: 30);
      if (!mounted) return;
      setState(() { _expiringDocs = docs; _maintenanceDue = maintenance; _loading = false; });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return DefaultTabController(length: 2, child: Column(children: [
      const TabBar(tabs: [
        Tab(text: 'Expiring Documents', icon: Icon(Icons.description)),
        Tab(text: 'Maintenance Due', icon: Icon(Icons.build)),
      ]),
      Expanded(child: TabBarView(children: [
        // Expiring docs
        _expiringDocs.isEmpty ? const Center(child: Text('No expiring documents'))
            : RefreshIndicator(onRefresh: _loadData, child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _expiringDocs.length,
                itemBuilder: (ctx, i) {
                  final doc = _expiringDocs[i];
                  final days = doc['daysUntilExpiry'] as int? ?? 0;
                  final expired = doc['isExpired'] == true;
                  final color = expired ? Colors.red : days <= 7 ? Colors.orange : Colors.amber;
                  return Card(
                    color: color.withValues(alpha: 0.05),
                    child: ListTile(
                      leading: CircleAvatar(backgroundColor: color.withValues(alpha: 0.2), child: Icon(Icons.warning, color: color)),
                      title: Text('${doc['registration_number'] ?? doc['driver_name'] ?? 'Unknown'} - ${(doc['type'] ?? '').toString().toUpperCase()}'),
                      subtitle: Text(expired ? 'EXPIRED ${-days} days ago' : 'Expires in $days days (${doc['expiry_date']})'),
                      trailing: Text(doc['owner_type'] ?? '', style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                    ),
                  );
                },
              )),
        // Maintenance due
        _maintenanceDue.isEmpty ? const Center(child: Text('No maintenance due'))
            : RefreshIndicator(onRefresh: _loadData, child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _maintenanceDue.length,
                itemBuilder: (ctx, i) {
                  final v = _maintenanceDue[i];
                  return Card(child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.build)),
                    title: Text(v['registration_number'] ?? ''),
                    subtitle: Text('Due: ${v['next_service_due'] ?? 'Unknown'}\nOdometer: ${v['odometer_km'] ?? '-'} km'),
                    isThreeLine: true,
                    onTap: () => context.push('/fleet/vehicles/${v['id']}'),
                  ));
                },
              )),
      ])),
    ]));
  }
}
