import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../data/fleet_repository.dart';

class DriverDetailScreen extends ConsumerStatefulWidget {
  final String driverId;
  const DriverDetailScreen({super.key, required this.driverId});
  @override
  ConsumerState<DriverDetailScreen> createState() => _DriverDetailScreenState();
}

class _DriverDetailScreenState extends ConsumerState<DriverDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final data = await ref.read(fleetRepositoryProvider).getDriverDetail(widget.driverId);
      if (!mounted) return;
      setState(() { _data = data; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'active': return Colors.green;
      case 'on_trip': return Colors.blue;
      case 'off_duty': return Colors.grey;
      case 'on_leave': return Colors.orange;
      default: return Colors.grey;
    }
  }

  @override
  void dispose() { _tabController.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_data == null) return const Center(child: Text('Driver not found'));

    final docs = (_data!['documents'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final trips = (_data!['upcomingTrips'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final ratings = (_data!['recentRatings'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final revenue = _data!['revenue'] as Map<String, dynamic>? ?? {};
    final revenueByMonth = (revenue['byMonth'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final status = _data!['status'] ?? 'active';

    return Column(children: [
      Container(
        padding: const EdgeInsets.all(16),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Row(children: [
          CircleAvatar(radius: 30, backgroundColor: Colors.green.shade100,
            child: Text((_data!['name'] ?? '?')[0].toUpperCase(), style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.green.shade700))),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_data!['name'] ?? '', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
            Row(children: [
              Icon(Icons.phone, size: 14, color: Colors.grey[600]),
              const SizedBox(width: 4),
              GestureDetector(
                onTap: () => launchUrl(Uri.parse('tel:${_data!['phone']}')),
                child: Text(_data!['phone'] ?? '', style: TextStyle(color: Colors.blue[700], decoration: TextDecoration.underline)),
              ),
            ]),
            Row(children: [
              ...List.generate(5, (j) => Icon(j < (_data!['rating'] ?? 0).round() ? Icons.star : Icons.star_border, size: 16, color: Colors.amber)),
              const SizedBox(width: 4),
              Text('(${_data!['totalTrips'] ?? 0} trips)', style: const TextStyle(fontSize: 12)),
            ]),
          ])),
          Chip(
            label: Text(status.replaceAll('_', ' ').toUpperCase(), style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.bold, fontSize: 12)),
            backgroundColor: _statusColor(status).withValues(alpha: 0.1),
          ),
        ]),
      ),
      TabBar(controller: _tabController, isScrollable: true, tabs: const [
        Tab(text: 'Documents'),
        Tab(text: 'Trips'),
        Tab(text: 'Revenue'),
        Tab(text: 'Ratings'),
        Tab(text: 'Info'),
      ]),
      Expanded(child: TabBarView(controller: _tabController, children: [
        // Documents
        docs.isEmpty ? const Center(child: Text('No documents'))
            : ListView.builder(padding: const EdgeInsets.all(16), itemCount: docs.length, itemBuilder: (ctx, i) {
                final doc = docs[i];
                final days = doc['daysUntilExpiry'] as int?;
                final color = days == null ? Colors.grey : days < 0 ? Colors.red : days <= 7 ? Colors.red : days <= 30 ? Colors.orange : Colors.green;
                return Card(child: ListTile(
                  leading: CircleAvatar(backgroundColor: color.withValues(alpha: 0.1), child: Icon(Icons.description, color: color)),
                  title: Text((doc['type'] as String).replaceAll('_', ' ').toUpperCase()),
                  subtitle: Text('Expires: ${doc['expiryDate'] ?? 'N/A'}'),
                ));
              }),
        // Trips
        trips.isEmpty ? const Center(child: Text('No upcoming trips'))
            : ListView.builder(padding: const EdgeInsets.all(16), itemCount: trips.length, itemBuilder: (ctx, i) {
                final trip = trips[i];
                return Card(child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.route)),
                  title: Text(trip['passengerName'] ?? 'Unknown'),
                  subtitle: Text('${trip['pickupDatetime'] ?? ''}'),
                  trailing: Chip(label: Text(trip['status'] ?? '')),
                  onTap: () => context.push('/fleet/trips/${trip['id']}'),
                ));
              }),
        // Revenue
        SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Summary cards
          Row(children: [
            Expanded(child: _RevenueCard(label: 'Total Revenue', value: '₹${_formatAmount(revenue['totalRevenue'])}', subtitle: '${revenue['totalInvoices'] ?? 0} invoices', color: Colors.green)),
            const SizedBox(width: 12),
            Expanded(child: _RevenueCard(label: 'This Month', value: '₹${_formatAmount(revenue['thisMonthRevenue'])}', subtitle: '${revenue['thisMonthInvoices'] ?? 0} invoices', color: Colors.blue)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _RevenueCard(label: 'Last Month', value: '₹${_formatAmount(revenue['lastMonthRevenue'])}', subtitle: '${revenue['lastMonthInvoices'] ?? 0} invoices', color: Colors.orange)),
            const SizedBox(width: 12),
            Expanded(child: _RevenueCard(label: 'Completed Trips', value: '${revenue['completedTrips'] ?? 0}', subtitle: 'lifetime', color: Colors.purple)),
          ]),
          const SizedBox(height: 12),
          // Average per trip
          if ((revenue['totalInvoices'] ?? 0) > 0)
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [
              Icon(Icons.trending_up, color: Colors.green[700]),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Avg Revenue per Trip', style: TextStyle(fontSize: 12, color: Colors.grey)),
                Text('₹${_formatAmount((revenue['totalRevenue'] ?? 0) / (revenue['totalInvoices'] ?? 1))}',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.green[700])),
              ]),
            ]))),
          const SizedBox(height: 20),
          // Monthly trend
          if (revenueByMonth.isNotEmpty) ...[
            Text('Monthly Revenue (Last 6 Months)', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...revenueByMonth.map((m) {
              final maxRevenue = revenueByMonth.fold<double>(0, (prev, e) => (e['revenue'] as num? ?? 0).toDouble() > prev ? (e['revenue'] as num? ?? 0).toDouble() : prev);
              final rev = (m['revenue'] as num? ?? 0).toDouble();
              return Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(m['month'] ?? '', style: const TextStyle(fontWeight: FontWeight.w500)),
                  Text('₹${_formatAmount(rev)} (${m['trips'] ?? 0} trips)', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                ]),
                const SizedBox(height: 4),
                LinearProgressIndicator(
                  value: maxRevenue > 0 ? rev / maxRevenue : 0,
                  backgroundColor: Colors.grey.shade200,
                  color: Colors.blue,
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(4),
                ),
              ]));
            }),
          ],
        ])),
        // Ratings
        ratings.isEmpty ? const Center(child: Text('No ratings yet'))
            : ListView.builder(padding: const EdgeInsets.all(16), itemCount: ratings.length, itemBuilder: (ctx, i) {
                final r = ratings[i];
                return Card(child: ListTile(
                  leading: CircleAvatar(backgroundColor: Colors.amber.shade50, child: Text('${r['rating']}', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.amber.shade800))),
                  title: Row(children: List.generate(5, (j) => Icon(j < (r['rating'] ?? 0) ? Icons.star : Icons.star_border, size: 16, color: Colors.amber))),
                  subtitle: Text(r['comments'] ?? 'No comment'),
                  trailing: Text(r['created_at']?.toString().substring(0, 10) ?? ''),
                ));
              }),
        // Info
        SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
          _Row('Name', _data!['name']),
          _Row('Phone', _data!['phone']),
          _Row('Email', _data!['email']),
          _Row('License', _data!['licenseNumber']),
          _Row('License Expiry', _data!['licenseExpiry']),
          _Row('Address', _data!['address']),
          _Row('Emergency', '${_data!['emergencyContactName'] ?? '-'} (${_data!['emergencyContactPhone'] ?? '-'})'),
          _Row('Joined', _data!['dateOfJoining']),
          _Row('Notes', _data!['notes']),
          const SizedBox(height: 24),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: () => context.push('/fleet/drivers/${widget.driverId}/edit'), icon: const Icon(Icons.edit), label: const Text('Edit'))),
          ]),
        ])),
      ])),
    ]);
  }
}

String _formatAmount(dynamic value) {
  final num v = (value is num) ? value : 0;
  if (v >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
  return v.toStringAsFixed(0);
}

class _RevenueCard extends StatelessWidget {
  final String label;
  final String value;
  final String subtitle;
  final Color color;
  const _RevenueCard({required this.label, required this.value, required this.subtitle, required this.color});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
      const SizedBox(height: 4),
      Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color)),
      Text(subtitle, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
    ])),
  );
}

class _Row extends StatelessWidget {
  final String label; final String? value;
  const _Row(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
    SizedBox(width: 130, child: Text(label, style: TextStyle(color: Colors.grey[600]))),
    Expanded(child: Text(value ?? '-', style: const TextStyle(fontWeight: FontWeight.w500))),
  ]));
}
