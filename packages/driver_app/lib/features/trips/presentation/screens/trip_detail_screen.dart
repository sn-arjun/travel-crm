import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/map_launcher.dart';
import '../../data/trip_provider.dart';
import '../../data/trip_view.dart';
import '../widgets/trip_status_badge.dart';

class TripDetailScreen extends ConsumerWidget {
  final String tripId;

  const TripDetailScreen({super.key, required this.tripId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(tripDetailProvider(tripId));

    if (state.isLoading && state.trip == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.tripDetail)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (state.trip == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.tripDetail)),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(state.error ?? l10n.error),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () =>
                    ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
                child: Text(l10n.retry),
              ),
            ],
          ),
        ),
      );
    }

    final trip = state.trip!;
    final view = TripView(trip);
    final status = view.status;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.tripDetail),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Status header
            _StatusHeader(status: status),
            const SizedBox(height: 16),

            // Passenger info
            if (view.passengerName != null) ...[
              _SectionCard(
                icon: Icons.person,
                title: l10n.passenger,
                children: [
                  Text(
                    view.passengerName ?? '',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (view.passengerPhone != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        view.passengerPhone!,
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Locations
            _SectionCard(
              icon: Icons.location_on,
              title: '${l10n.pickupLocation} & ${l10n.dropLocation}',
              children: [
                _LocationTile(
                  label: l10n.pickupLocation,
                  address: view.pickupLocation.isEmpty
                      ? '—'
                      : view.pickupLocation,
                  color: AppColors.success,
                  onNavigate: view.pickupLat != null && view.pickupLng != null
                      ? () => MapLauncher.navigate(
                            lat: view.pickupLat!,
                            lng: view.pickupLng!,
                          )
                      : null,
                ),
                const Divider(height: 24),
                _LocationTile(
                  label: l10n.dropLocation,
                  address:
                      view.dropLocation.isEmpty ? '—' : view.dropLocation,
                  color: AppColors.error,
                  onNavigate: view.dropLat != null && view.dropLng != null
                      ? () => MapLauncher.navigate(
                            lat: view.dropLat!,
                            lng: view.dropLng!,
                          )
                      : null,
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Vehicle
            if (view.vehicleRegistration != null) ...[
              _SectionCard(
                icon: Icons.directions_car,
                title: l10n.vehicle,
                children: [
                  Text(
                    view.vehicleRegistration ?? '',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  if (view.vehicleName != null || view.vehicleType != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        [view.vehicleName, view.vehicleType]
                            .whereType<String>()
                            .join(' · '),
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Schedule
            if (view.pickupAt != null || view.dropAt != null) ...[
              _SectionCard(
                icon: Icons.schedule,
                title: 'Schedule',
                children: [
                  if (view.pickupAt != null)
                    _InfoRow(
                      label: 'Pickup',
                      value: TripView.formatDateTime(view.pickupAt!),
                    ),
                  if (view.dropAt != null)
                    _InfoRow(
                      label: 'Drop',
                      value: TripView.formatDateTime(view.dropAt!),
                    ),
                  if (view.leadTitle != null)
                    _InfoRow(label: 'Booking', value: view.leadTitle!),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Trip type & cost info
            if (trip['tripType'] != null ||
                trip['estimatedCost'] != null) ...[
              _SectionCard(
                icon: Icons.price_change,
                title: 'Trip Info',
                children: [
                  if (trip['tripType'] != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.orange.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            _tripTypeLabel(trip['tripType'] as String),
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.orange,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ]),
                    ),
                  if (trip['estimatedCost'] != null)
                    _InfoRow(
                      label: 'Estimated Cost',
                      value:
                          '\u20B9${(trip['estimatedCost'] as num).toStringAsFixed(0)}',
                    ),
                  if (trip['actualCost'] != null)
                    _InfoRow(
                      label: 'Actual Cost',
                      value:
                          '\u20B9${(trip['actualCost'] as num).toStringAsFixed(0)}',
                    ),
                  if (trip['estimatedDistanceKm'] != null)
                    _InfoRow(
                      label: 'Distance',
                      value:
                          '${(trip['estimatedDistanceKm'] as num).toStringAsFixed(1)} km',
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Special instructions
            if (trip['specialInstructions'] != null &&
                (trip['specialInstructions'] as String).isNotEmpty) ...[
              _SectionCard(
                icon: Icons.info_outline,
                title: l10n.specialInstructions,
                children: [
                  Text(trip['specialInstructions']),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Timeline
            if (trip['timeline'] is List &&
                (trip['timeline'] as List).isNotEmpty) ...[
              _SectionCard(
                icon: Icons.timeline,
                title: l10n.timeline,
                children: [
                  ...(trip['timeline'] as List).map((entry) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: AppColors.statusColor(
                                  entry['status'] ?? ''),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  entry['status'] ?? '',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600),
                                ),
                                if (entry['createdAt'] != null)
                                  Text(
                                    _formatTimestamp(
                                        entry['createdAt'] as String),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[600],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Spacer for bottom bar
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: _ActionBar(
        tripId: tripId,
        status: status,
        trip: trip,
      ),
    );
  }

  String _formatTimestamp(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    final min = dt.minute.toString().padLeft(2, '0');
    return '${dt.day}/${dt.month}/${dt.year} $hour:$min $amPm';
  }

  static String _tripTypeLabel(String type) {
    const labels = {
      'one_way': 'One Way',
      'round_trip': 'Round Trip',
      'airport_pickup': 'Airport Pickup',
      'airport_drop': 'Airport Drop',
      'local_8h80km': 'Local 8hr/80km',
      'local_12h120km': 'Local 12hr/120km',
      'outstation': 'Outstation',
    };
    return labels[type] ?? type;
  }
}

class _StatusHeader extends StatelessWidget {
  final String status;

  const _StatusHeader({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.statusColor(status).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.statusColor(status).withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          TripStatusBadge(status: status),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<Widget> children;

  const _SectionCard({
    required this.icon,
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _LocationTile extends StatelessWidget {
  final String label;
  final String address;
  final Color color;
  final VoidCallback? onNavigate;

  const _LocationTile({
    required this.label,
    required this.address,
    required this.color,
    this.onNavigate,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Icons.circle, size: 10, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
              const SizedBox(height: 2),
              Text(address, style: const TextStyle(fontSize: 14)),
            ],
          ),
        ),
        if (onNavigate != null)
          IconButton(
            icon: const Icon(Icons.navigation_outlined),
            onPressed: onNavigate,
            tooltip: 'Navigate',
          ),
      ],
    );
  }
}

class _ActionBar extends ConsumerWidget {
  final String tripId;
  final String status;
  final Map<String, dynamic> trip;

  const _ActionBar({
    required this.tripId,
    required this.status,
    required this.trip,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(tripDetailProvider(tripId));

    if (status == 'completed' || status == 'cancelled') {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: _buildActions(context, ref, l10n, state.isActionLoading),
        ),
      ),
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref,
      AppLocalizations l10n, bool loading) {
    switch (status) {
      case 'assigned':
        return [
          Expanded(
            child: OutlinedButton(
              onPressed: loading
                  ? null
                  : () => _showRejectSheet(context, ref, l10n),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(l10n.reject),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton(
              key: const Key('action-accept'),
              onPressed: loading
                  ? null
                  : () => _showAcceptDialog(context, ref, l10n),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.accept),
            ),
          ),
        ];
      case 'accepted':
        return [
          _NavButton(trip: trip),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton(
              key: const Key('action-en-route'),
              onPressed: loading
                  ? null
                  : () async {
                      final ok = await ref
                          .read(tripDetailProvider(tripId).notifier)
                          .updateStatus('en_route');
                      if (ok && context.mounted) {
                        ref.invalidate(tripListProvider('today'));
                      }
                    },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.enRoute,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(l10n.enRoute),
            ),
          ),
        ];
      case 'en_route':
        return [
          _NavButton(trip: trip),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton(
              key: const Key('action-check-in'),
              onPressed: loading
                  ? null
                  : () => context.push('/trips/$tripId/check-in'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.started,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(l10n.checkIn),
            ),
          ),
        ];
      case 'started':
        return [
          Expanded(
            child: OutlinedButton(
              onPressed: loading
                  ? null
                  : () => context.push('/trips/$tripId/check-out'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(l10n.checkOut),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: FilledButton(
              key: const Key('action-complete'),
              onPressed: loading
                  ? null
                  : () async {
                      final ok = await ref
                          .read(tripDetailProvider(tripId).notifier)
                          .updateStatus('completed');
                      if (ok && context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(l10n.markCompleted),
                            backgroundColor: AppColors.success,
                          ),
                        );
                        ref.invalidate(tripListProvider('today'));
                        ref.invalidate(tripListProvider('past'));
                      }
                    },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.completed,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: Text(l10n.markCompleted),
            ),
          ),
        ];
      default:
        return [];
    }
  }

  void _showAcceptDialog(
      BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.acceptTrip),
        content: Text(l10n.acceptTripConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            key: const Key('confirm-accept'),
            onPressed: () async {
              Navigator.pop(ctx);
              final ok = await ref
                  .read(tripDetailProvider(tripId).notifier)
                  .acceptTrip();
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(l10n.tripAccepted),
                    backgroundColor: AppColors.success,
                  ),
                );
                ref.invalidate(tripListProvider('today'));
                ref.invalidate(tripListProvider('upcoming'));
              }
            },
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
  }

  void _showRejectSheet(
      BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    String? selectedReason;
    final customController = TextEditingController();
    final reasons = <String>[
      l10n.scheduleConflict,
      l10n.tooFar,
      l10n.vehicleIssue,
      l10n.personalEmergency,
      l10n.other,
    ];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            24,
            24,
            24 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.rejectTrip,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              RadioGroup<String>(
                groupValue: selectedReason ?? '',
                onChanged: (v) =>
                    setSheetState(() => selectedReason = v),
                child: Column(
                  children: reasons.map((reason) => RadioListTile<String>(
                    title: Text(reason),
                    value: reason,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  )).toList(),
                ),
              ),
              if (selectedReason == l10n.other) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: customController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: l10n.enterReason,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  final reason = selectedReason == l10n.other
                      ? customController.text.trim()
                      : selectedReason;
                  if (reason == null || reason.isEmpty) return;
                  if (selectedReason == l10n.other && reason.length < 10) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l10n.reasonTooShort)),
                    );
                    return;
                  }
                  Navigator.pop(ctx);
                  ref
                      .read(tripDetailProvider(tripId).notifier)
                      .rejectTrip(reason)
                      .then((ok) {
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(l10n.tripRejected)),
                      );
                      context.pop();
                      ref.invalidate(tripListProvider('today'));
                      ref.invalidate(tripListProvider('upcoming'));
                    }
                  });
                },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.error,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(l10n.confirmReject),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  final Map<String, dynamic> trip;

  const _NavButton({required this.trip});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final view = TripView(trip);
    final lat = view.pickupLat;
    final lng = view.pickupLng;
    if (lat == null || lng == null) return const SizedBox.shrink();

    return Expanded(
      child: OutlinedButton.icon(
        onPressed: () => MapLauncher.navigate(lat: lat, lng: lng),
        icon: const Icon(Icons.navigation_outlined),
        label: Text(l10n.navigate),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[600])),
          Text(value,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
