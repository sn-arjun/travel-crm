import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/fleet_provider.dart';
import '../../data/fleet_state.dart';

class DriverListScreen extends ConsumerStatefulWidget {
  const DriverListScreen({super.key});
  @override
  ConsumerState<DriverListScreen> createState() => _DriverListScreenState();
}

class _DriverListScreenState extends ConsumerState<DriverListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(driverListProvider.notifier).load(refresh: true);
    });
  }

  @override
  void dispose() { _searchController.dispose(); super.dispose(); }

  Color _statusColor(String status) {
    switch (status) {
      case 'active': return Colors.green;
      case 'on_trip': return Colors.blue;
      case 'off_duty': return Colors.grey;
      case 'on_leave': return Colors.orange;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'active': return 'Active';
      case 'on_trip': return 'On Trip';
      case 'off_duty': return 'Off Duty';
      case 'on_leave': return 'On Leave';
      default: return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverListProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by name or phone...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchController.clear(); ref.read(driverListProvider.notifier).setSearch(''); })
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onChanged: (v) => ref.read(driverListProvider.notifier).setSearch(v),
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _buildChip(null, 'All', state.statusFilter),
                const SizedBox(width: 8),
                _buildChip('active', 'Active', state.statusFilter),
                const SizedBox(width: 8),
                _buildChip('on_trip', 'On Trip', state.statusFilter),
                const SizedBox(width: 8),
                _buildChip('off_duty', 'Off Duty', state.statusFilter),
                const SizedBox(width: 8),
                _buildChip('on_leave', 'On Leave', state.statusFilter),
              ]),
            ),
          ]),
        ),
        Expanded(child: _buildBody(state)),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(width: double.infinity, child: FilledButton.icon(
            onPressed: () => context.push('/fleet/drivers/new'),
            icon: const Icon(Icons.person_add),
            label: const Text('Add Driver'),
          )),
        ),
      ],
    );
  }

  Widget _buildChip(String? value, String label, String? current) {
    return FilterChip(label: Text(label), selected: current == value,
      onSelected: (_) => ref.read(driverListProvider.notifier).setStatusFilter(value));
  }

  Widget _buildBody(DriverListState state) {
    if (state.status == FleetListStatus.loading && state.items.isEmpty) return const Center(child: CircularProgressIndicator());
    if (state.status == FleetListStatus.error && state.items.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(state.error ?? 'Failed to load'), const SizedBox(height: 16),
        FilledButton(onPressed: () => ref.read(driverListProvider.notifier).load(refresh: true), child: const Text('Retry')),
      ]));
    }
    if (state.items.isEmpty) {
      return AppEmptyState(icon: Icons.people_outlined, title: 'No drivers found',
        subtitle: state.search.isNotEmpty || state.statusFilter != null ? 'Try adjusting your filters' : 'Add your first driver to get started');
    }
    return RefreshIndicator(
      onRefresh: () => ref.read(driverListProvider.notifier).load(refresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.items.length + (state.pagination?.hasMore == true ? 1 : 0),
        itemBuilder: (ctx, i) {
          if (i >= state.items.length) {
            WidgetsBinding.instance.addPostFrameCallback((_) { ref.read(driverListProvider.notifier).loadNextPage(); });
            return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
          }
          final driver = state.items[i];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: InkWell(
              onTap: () => context.push('/fleet/drivers/${driver.id}'),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  CircleAvatar(radius: 24, backgroundColor: Colors.green.shade50,
                    child: Text(driver.name.isNotEmpty ? driver.name[0].toUpperCase() : '?', style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.bold, fontSize: 18))),
                  const SizedBox(width: 16),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(driver.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(driver.phone, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600])),
                    const SizedBox(height: 4),
                    Row(children: [
                      ...List.generate(5, (j) => Icon(j < driver.rating.round() ? Icons.star : Icons.star_border, size: 14, color: Colors.amber)),
                      const SizedBox(width: 4),
                      Text('(${driver.totalTrips} trips)', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ]),
                  ])),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: _statusColor(driver.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
                    child: Text(_statusLabel(driver.status), style: TextStyle(color: _statusColor(driver.status), fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}
