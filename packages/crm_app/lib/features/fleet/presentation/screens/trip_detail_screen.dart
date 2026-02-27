import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_provider.dart';
import '../widgets/trip_cost_estimate_card.dart';

class TripDetailScreen extends ConsumerStatefulWidget {
  final String tripId;
  const TripDetailScreen({super.key, required this.tripId});
  @override
  ConsumerState<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends ConsumerState<TripDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _generatingInvoice = false;
  bool _generatingVoucher = false;

  static const _validTransitions = <String, List<String>>{
    'assigned': ['accepted', 'cancelled'],
    'accepted': ['en_route', 'cancelled'],
    'en_route': ['started'],
    'started': ['completed'],
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
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final data = await ref
          .read(fleetRepositoryProvider)
          .getTripDetail(widget.tripId);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'assigned':
        return Colors.grey;
      case 'accepted':
        return Colors.blue;
      case 'en_route':
        return Colors.indigo;
      case 'started':
        return Colors.green;
      case 'completed':
        return Colors.teal;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Future<void> _changeStatus(String newStatus) async {
    String? reason;
    if (newStatus == 'cancelled') {
      reason = await showDialog<String>(
          context: context,
          builder: (ctx) {
            final controller = TextEditingController();
            return AlertDialog(
              title: const Text('Cancel Trip'),
              content: TextField(
                  controller: controller,
                  decoration: const InputDecoration(labelText: 'Reason'),
                  maxLines: 2),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Back')),
                FilledButton(
                    onPressed: () => Navigator.pop(ctx, controller.text),
                    child: const Text('Cancel Trip')),
              ],
            );
          });
      if (reason == null) return;
    }
    try {
      await ref
          .read(fleetRepositoryProvider)
          .updateTripStatus(widget.tripId, newStatus, reason: reason);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Status updated'), backgroundColor: Colors.green));
      _loadData();
      ref.read(tripListProvider.notifier).load(refresh: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    }
  }

  Future<void> _generateInvoice() async {
    setState(() => _generatingInvoice = true);
    try {
      await ref
          .read(fleetRepositoryProvider)
          .generateTripInvoice(widget.tripId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Invoice generated'), backgroundColor: Colors.green));
      _loadData();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _generatingInvoice = false);
    }
  }

  Future<void> _generateVoucher() async {
    setState(() => _generatingVoucher = true);
    try {
      await ref
          .read(fleetRepositoryProvider)
          .generateTripVoucher(widget.tripId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Voucher generated'), backgroundColor: Colors.green));
      _loadData();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _generatingVoucher = false);
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_data == null) return const Center(child: Text('Trip not found'));

    final status = _data!['status'] ?? 'assigned';
    final timeline =
        (_data!['timeline'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final costs =
        (_data!['costs'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final nextStatuses = _validTransitions[status] ?? [];
    final tripType = _data!['tripType'] ?? 'one_way';
    final invoiceId = _data!['invoiceId'];
    final voucherId = _data!['voucherId'];
    final hasEstimate = _data!['estimatedBreakdown'] != null;
    final hasActual = _data!['actualBreakdown'] != null;

    return Column(children: [
      // Header
      Container(
        padding: const EdgeInsets.all(16),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text(_data!['passengerName'] ?? 'No passenger',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold)),
              ),
              Chip(
                label: Text(
                    status.replaceAll('_', ' ').toUpperCase(),
                    style: TextStyle(
                        color: _statusColor(status),
                        fontWeight: FontWeight.bold,
                        fontSize: 12)),
                backgroundColor:
                    _statusColor(status).withValues(alpha: 0.1),
              ),
            ]),
            const SizedBox(height: 4),
            // Trip type badge
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                _tripTypes[tripType] ?? tripType,
                style: const TextStyle(
                    fontSize: 12,
                    color: Colors.orange,
                    fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Icon(Icons.my_location, size: 14, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                    '${_data!['pickupLocation'] ?? '-'} \u2192 ${_data!['dropLocation'] ?? '-'}'),
              ),
            ]),
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.access_time, size: 14, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Text(_data!['pickupDatetime']
                      ?.toString()
                      .substring(0, 16)
                      .replaceAll('T', ' ') ??
                  '-'),
            ]),
            if (_data!['estimatedDistanceKm'] != null) ...[
              const SizedBox(height: 4),
              Row(children: [
                Icon(Icons.straighten, size: 14, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                    '${(_data!['estimatedDistanceKm'] as num).toStringAsFixed(1)} km est.'),
                if (_data!['actualDistanceKm'] != null) ...[
                  const SizedBox(width: 12),
                  Text(
                    '${(_data!['actualDistanceKm'] as num).toStringAsFixed(1)} km actual',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ]),
            ],
            const SizedBox(height: 8),
            Row(children: [
              if (_data!['vehicleRegistration'] != null) ...[
                Icon(Icons.directions_car,
                    size: 14, color: Colors.blue[600]),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: () => context
                      .push('/fleet/vehicles/${_data!['vehicleId']}'),
                  child: Text(_data!['vehicleRegistration']!,
                      style: TextStyle(
                          color: Colors.blue[700],
                          decoration: TextDecoration.underline)),
                ),
                const SizedBox(width: 16),
              ],
              if (_data!['driverName'] != null) ...[
                Icon(Icons.person, size: 14, color: Colors.green[600]),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: () => context
                      .push('/fleet/drivers/${_data!['driverId']}'),
                  child: Text(_data!['driverName']!,
                      style: TextStyle(
                          color: Colors.green[700],
                          decoration: TextDecoration.underline)),
                ),
              ],
            ]),
            if (nextStatuses.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: nextStatuses
                    .map((s) => FilledButton(
                          onPressed: () => _changeStatus(s),
                          style: FilledButton.styleFrom(
                              backgroundColor:
                                  s == 'cancelled' ? Colors.red : null),
                          child: Text(s == 'cancelled'
                              ? 'Cancel'
                              : 'Mark ${s.replaceAll('_', ' ')}'),
                        ))
                    .toList(),
              ),
            ],
            // Invoice/Voucher quick actions
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (invoiceId != null)
                OutlinedButton.icon(
                  onPressed: () =>
                      context.push('/invoices/$invoiceId'),
                  icon: const Icon(Icons.receipt, size: 16),
                  label: const Text('View Invoice'),
                )
              else if (status == 'completed')
                OutlinedButton.icon(
                  onPressed:
                      _generatingInvoice ? null : _generateInvoice,
                  icon: _generatingInvoice
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2))
                      : const Icon(Icons.receipt_long, size: 16),
                  label: const Text('Generate Invoice'),
                ),
              if (voucherId != null)
                OutlinedButton.icon(
                  onPressed: () =>
                      context.push('/vouchers/$voucherId'),
                  icon: const Icon(
                      Icons.confirmation_number, size: 16),
                  label: const Text('View Voucher'),
                )
              else
                OutlinedButton.icon(
                  onPressed:
                      _generatingVoucher ? null : _generateVoucher,
                  icon: _generatingVoucher
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2))
                      : const Icon(
                          Icons.confirmation_number_outlined,
                          size: 16),
                  label: const Text('Generate Voucher'),
                ),
            ]),
          ],
        ),
      ),
      TabBar(controller: _tabController, tabs: const [
        Tab(text: 'Timeline'),
        Tab(text: 'Costs'),
        Tab(text: 'Pricing'),
        Tab(text: 'Info'),
      ]),
      Expanded(
        child: TabBarView(controller: _tabController, children: [
          // ── Timeline Tab ──
          timeline.isEmpty
              ? const Center(child: Text('No timeline entries'))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: timeline.length,
                  itemBuilder: (ctx, i) {
                    final e = timeline[i];
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: _statusColor(
                                  e['status'] ?? '')
                              .withValues(alpha: 0.1),
                          child: Icon(Icons.circle,
                              color:
                                  _statusColor(e['status'] ?? ''),
                              size: 16),
                        ),
                        title: Text(
                            (e['status'] ?? '')
                                .toString()
                                .replaceAll('_', ' ')
                                .toUpperCase()),
                        subtitle: Text(
                            '${e['created_at']?.toString().substring(0, 19).replaceAll('T', ' ') ?? ''}${e['notes'] != null ? '\n${e['notes']}' : ''}'),
                        isThreeLine: e['notes'] != null,
                      ),
                    );
                  }),

          // ── Costs Tab ──
          Column(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Text('Total: \u20B9${_data!['totalCost'] ?? 0}',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const Spacer(),
                FilledButton.icon(
                    onPressed: () => _addCost(),
                    icon: const Icon(Icons.add),
                    label: const Text('Add Cost')),
              ]),
            ),
            Expanded(
              child: costs.isEmpty
                  ? const Center(child: Text('No costs recorded'))
                  : ListView.builder(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: costs.length,
                      itemBuilder: (ctx, i) {
                        final c = costs[i];
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(
                                child: Text('\u20B9',
                                    style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: Colors
                                            .green.shade700))),
                            title: Text((c['cost_type'] ?? '')
                                .toString()
                                .replaceAll('_', ' ')),
                            subtitle:
                                Text(c['description'] ?? ''),
                            trailing: Text(
                                '\u20B9${c['amount']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold)),
                          ),
                        );
                      }),
            ),
          ]),

          // ── Pricing Tab ──
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_data!['rateCardName'] != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .primaryContainer
                          .withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      Icon(Icons.price_change,
                          size: 18,
                          color: Theme.of(context)
                              .colorScheme
                              .primary),
                      const SizedBox(width: 8),
                      Text(
                          'Rate Card: ${_data!['rateCardName']}',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                ],
                // Show comparison if both exist
                if (hasEstimate || hasActual)
                  TripCostComparisonCard(
                    estimated:
                        _data!['estimatedBreakdown'] is Map
                            ? Map<String, dynamic>.from(
                                _data!['estimatedBreakdown'] as Map)
                            : null,
                    actual: _data!['actualBreakdown'] is Map
                        ? Map<String, dynamic>.from(
                            _data!['actualBreakdown'] as Map)
                        : null,
                    costOverride:
                        (_data!['costOverride'] as num?)
                            ?.toDouble(),
                    overrideReason:
                        _data!['costOverrideReason'] as String?,
                  ),
                if (hasEstimate && !hasActual) ...[
                  const SizedBox(height: 16),
                  TripCostEstimateCard(
                    breakdown: _data!['estimatedBreakdown'] is Map
                        ? Map<String, dynamic>.from(
                            _data!['estimatedBreakdown'] as Map)
                        : null,
                  ),
                ],
                if (!hasEstimate && !hasActual)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('No pricing data available',
                          style: TextStyle(color: Colors.grey)),
                    ),
                  ),
                // Profit margin (if invoice exists)
                if (invoiceId != null &&
                    (_data!['estimatedCost'] != null ||
                        _data!['actualCost'] != null)) ...[
                  const SizedBox(height: 16),
                  _ProfitCard(
                    billed:
                        (_data!['actualCost'] as num?)?.toDouble() ??
                            (_data!['estimatedCost'] as num?)
                                ?.toDouble() ??
                            0,
                    totalCost:
                        (costs.fold<double>(0, (sum, c) =>
                            sum +
                            ((c['amount'] as num?)?.toDouble() ??
                                0))),
                  ),
                ],
              ],
            ),
          ),

          // ── Info Tab ──
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              _R('Trip Type',
                  _tripTypes[tripType] ?? tripType),
              _R('Passenger', _data!['passengerName']),
              _R('Phone', _data!['passengerPhone']),
              _R('Pickup', _data!['pickupLocation']),
              _R('Drop', _data!['dropLocation']),
              _R('Pickup Time', _data!['pickupDatetime']),
              _R('Drop Time', _data!['dropDatetime']),
              _R('Instructions', _data!['specialInstructions']),
              _R('Vehicle',
                  '${_data!['vehicleRegistration'] ?? '-'} (${_data!['vehicleType'] ?? ''})'),
              _R('Driver',
                  '${_data!['driverName'] ?? '-'} (${_data!['driverPhone'] ?? ''})'),
              if (_data!['contactName'] != null)
                _R('Contact', _data!['contactName']),
              if (_data!['leadTitle'] != null)
                _R('Lead', _data!['leadTitle']),
              _R('Status', status),
              if (_data!['estimatedCost'] != null)
                _R('Estimated Cost',
                    '\u20B9${(_data!['estimatedCost'] as num).toStringAsFixed(0)}'),
              if (_data!['actualCost'] != null)
                _R('Actual Cost',
                    '\u20B9${(_data!['actualCost'] as num).toStringAsFixed(0)}'),
              if (_data!['costOverride'] != null)
                _R('Cost Override',
                    '\u20B9${(_data!['costOverride'] as num).toStringAsFixed(0)}'),
            ]),
          ),
        ]),
      ),
    ]);
  }

  Future<void> _addCost() async {
    final costTypes = ['fuel', 'toll', 'driver_allowance', 'parking', 'other'];
    String selectedType = 'fuel';
    final amountController = TextEditingController();
    final descController = TextEditingController();
    final result = await showDialog<bool>(
        context: context,
        builder: (ctx) => StatefulBuilder(
              builder: (ctx, setDialogState) => AlertDialog(
                title: const Text('Add Cost'),
                content: Column(mainAxisSize: MainAxisSize.min, children: [
                  DropdownButtonFormField<String>(
                      initialValue: selectedType,
                      decoration: const InputDecoration(labelText: 'Type'),
                      items: costTypes
                          .map((t) => DropdownMenuItem(
                              value: t,
                              child: Text(t.replaceAll('_', ' '))))
                          .toList(),
                      onChanged: (v) =>
                          setDialogState(() => selectedType = v!)),
                  const SizedBox(height: 16),
                  TextField(
                      controller: amountController,
                      decoration: const InputDecoration(
                          labelText: 'Amount', prefixText: '\u20B9'),
                      keyboardType: TextInputType.number),
                  const SizedBox(height: 16),
                  TextField(
                      controller: descController,
                      decoration:
                          const InputDecoration(labelText: 'Description')),
                ]),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Add')),
                ],
              ),
            ));
    if (result != true || amountController.text.isEmpty) return;
    try {
      await ref.read(fleetRepositoryProvider).addTripCost(widget.tripId, {
        'costType': selectedType,
        'amount': double.tryParse(amountController.text) ?? 0,
        if (descController.text.isNotEmpty) 'description': descController.text,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Cost added'), backgroundColor: Colors.green));
      _loadData();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    }
  }
}

class _R extends StatelessWidget {
  final String label;
  final String? value;
  const _R(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 120,
            child: Text(label, style: TextStyle(color: Colors.grey[600]))),
        Expanded(
            child: Text(value ?? '-',
                style: const TextStyle(fontWeight: FontWeight.w500))),
      ]));
}

class _ProfitCard extends StatelessWidget {
  final double billed;
  final double totalCost;
  const _ProfitCard({required this.billed, required this.totalCost});

  @override
  Widget build(BuildContext context) {
    final profit = billed - totalCost;
    final margin = billed > 0 ? (profit / billed * 100) : 0;
    final isProfit = profit >= 0;

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.trending_up,
                  size: 20,
                  color: isProfit ? Colors.green : Colors.red),
              const SizedBox(width: 8),
              Text('Profit Margin',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
            ]),
            const Divider(height: 20),
            Row(children: [
              Expanded(
                child: Column(children: [
                  Text('Billed',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(height: 4),
                  Text('\u20B9${billed.toStringAsFixed(0)}',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                ]),
              ),
              Container(width: 1, height: 40, color: Colors.grey[300]),
              Expanded(
                child: Column(children: [
                  Text('Costs',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(height: 4),
                  Text('\u20B9${totalCost.toStringAsFixed(0)}',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                ]),
              ),
              Container(width: 1, height: 40, color: Colors.grey[300]),
              Expanded(
                child: Column(children: [
                  Text('Profit',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(height: 4),
                  Text(
                    '\u20B9${profit.toStringAsFixed(0)} (${margin.toStringAsFixed(0)}%)',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: isProfit ? Colors.green : Colors.red,
                    ),
                  ),
                ]),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
