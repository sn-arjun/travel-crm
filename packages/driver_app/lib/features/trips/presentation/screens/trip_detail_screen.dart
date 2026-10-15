import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../app/theme.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/call_launcher.dart';
import '../../../../core/utils/map_launcher.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/phone.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../data/trip_provider.dart';
import '../../data/trip_view.dart';
import '../widgets/trip_card.dart';
import '../widgets/trip_status_badge.dart';
import '../widgets/trip_timeline.dart';

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
        body: const _DetailSkeleton(),
      );
    }

    if (state.trip == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.tripDetail)),
        body: StateMessage(
          key: const Key('trip-error'),
          icon: Icons.cloud_off_outlined,
          isError: true,
          title: l10n.tripLoadError,
          message: state.error,
          actionLabel: l10n.retry,
          onAction: () =>
              ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
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
            tooltip: l10n.refresh,
            onPressed: () =>
                ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(tripDetailProvider(tripId).notifier).loadDetail(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          // Keep the last card clear of the sticky action bar (12 + 48 + 12
          // plus a small gap) or of the system inset when there is no bar.
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            24 +
                (_hasActionBar(status)
                    ? 72 + MediaQuery.of(context).padding.bottom
                    : MediaQuery.of(context).padding.bottom),
          ),
          children: [
            _HeaderCard(view: view, status: status),
            const SizedBox(height: 12),

            // Route with "Open in Maps"
            SectionCard(
              icon: Icons.route_outlined,
              title: l10n.route,
              children: [
                _RoutePoint(
                  mapsKey: const Key('open-maps-pickup'),
                  label: l10n.pickupLocation,
                  address: view.pickupLocation,
                  dotColor: AppSemantic.of(context).success.color,
                  isLast: false,
                  onOpenMaps: _mapsAction(
                      view.pickupLocation, view.pickupLat, view.pickupLng),
                ),
                _RoutePoint(
                  mapsKey: const Key('open-maps-drop'),
                  label: l10n.dropLocation,
                  address: view.dropLocation,
                  dotColor: AppSemantic.of(context).danger.color,
                  isLast: true,
                  onOpenMaps: _mapsAction(
                      view.dropLocation, view.dropLat, view.dropLng),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Vehicle
            if (view.vehicleRegistration != null) ...[
              SectionCard(
                icon: Icons.directions_car_outlined,
                title: l10n.vehicle,
                children: [
                  Row(
                    children: [
                      VehicleChip(registration: view.vehicleRegistration!),
                      const SizedBox(width: 12),
                      if (view.vehicleName != null || view.vehicleType != null)
                        Expanded(
                          child: Text(
                            [view.vehicleName, view.vehicleType]
                                .whereType<String>()
                                .join(' · '),
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Special instructions
            if (view.specialInstructions != null) ...[
              SectionCard(
                icon: Icons.info_outline,
                title: l10n.specialInstructions,
                children: [
                  Text(
                    view.specialInstructions!,
                    key: const Key('special-instructions'),
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Schedule, trip type and cost
            ..._detailsSection(context, l10n, trip, view),

            // Timeline
            SectionCard(
              icon: Icons.timeline,
              title: l10n.timeline,
              children: [TripTimeline(steps: buildTimelineSteps(trip))],
            ),
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

  static bool _hasActionBar(String status) =>
      const {'assigned', 'accepted', 'en_route', 'started'}.contains(status);

  /// "Open in Maps" handler: coordinates when known, else the address.
  VoidCallback? _mapsAction(String address, double? lat, double? lng) {
    if (lat != null && lng != null) {
      return () => MapLauncher.navigate(
            lat: lat,
            lng: lng,
            address: address.isEmpty ? null : address,
          );
    }
    if (address.trim().isNotEmpty) {
      return () => MapLauncher.openAddress(address);
    }
    return null;
  }

  List<Widget> _detailsSection(BuildContext context, AppLocalizations l10n,
      Map<String, dynamic> trip, TripView view) {
    final rows = <Widget>[
      if (view.dropAt != null)
        _InfoRow(
          label: l10n.dropTime,
          value: TripView.formatDateTime(view.dropAt!),
        ),
      if (view.leadTitle != null)
        _InfoRow(label: l10n.booking, value: view.leadTitle!),
      if (trip['tripType'] is String)
        _InfoRow(
          label: l10n.tripType,
          value: _tripTypeLabel(trip['tripType'] as String),
        ),
      if (trip['estimatedCost'] is num)
        _InfoRow(
          label: l10n.estimatedCost,
          value: formatAgencyMoney(trip['estimatedCost'] as num),
        ),
      if (trip['actualCost'] is num)
        _InfoRow(
          label: l10n.actualCost,
          value: formatAgencyMoney(trip['actualCost'] as num),
        ),
      if (trip['estimatedDistanceKm'] is num)
        _InfoRow(
          label: l10n.distance,
          value:
              '${(trip['estimatedDistanceKm'] as num).toStringAsFixed(1)} km',
        ),
    ];
    if (rows.isEmpty) return const [];
    return [
      SectionCard(
        icon: Icons.receipt_long_outlined,
        title: l10n.tripDetails,
        children: rows,
      ),
      const SizedBox(height: 12),
    ];
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

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      key: const Key('trip-detail-loading'),
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: const [
        TripCardSkeleton(),
        SizedBox(height: 12),
        TripCardSkeleton(),
        SizedBox(height: 12),
        TripCardSkeleton(),
      ],
    );
  }
}

/// Status chip, pickup time and passenger (with call button).
class _HeaderCard extends StatelessWidget {
  final TripView view;
  final String status;

  const _HeaderCard({required this.view, required this.status});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final style = TripStatusStyle.of(context, status);
    final pickupAt = view.pickupAt;
    final phone = view.passengerPhone;

    return Card(
      color: style.container.withValues(alpha: 0.5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: style.color.withValues(alpha: 0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                TripStatusBadge(status: status, large: true),
                const Spacer(),
                if (pickupAt != null)
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(TripView.formatTime(pickupAt),
                              style: text.headlineSmall),
                          Text(
                            TripView.relativeDate(pickupAt, DateTime.now()),
                            style: text.bodySmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            if (view.passengerName != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(AppRadius.input),
                  border: Border.all(color: scheme.outlineVariant),
                ),
                child: Row(
                  children: [
                    Icon(Icons.person_outline, color: scheme.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.passenger,
                            style: text.labelSmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                          Text(view.passengerName!, style: text.titleMedium),
                          if (phone != null)
                            Text(
                              formatPhoneDisplay(phone),
                              key: const Key('passenger-phone'),
                              style: text.bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                        ],
                      ),
                    ),
                    if (phone != null)
                      IconButton.filledTonal(
                        key: const Key('call-passenger'),
                        tooltip: l10n.callPassenger,
                        icon: const Icon(Icons.call),
                        onPressed: () => callPhone(phone),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A stop on the route with its address and an "Open in Maps" button.
class _RoutePoint extends StatelessWidget {
  final Key mapsKey;
  final String label;
  final String address;
  final Color dotColor;
  final bool isLast;
  final VoidCallback? onOpenMaps;

  const _RoutePoint({
    required this.mapsKey,
    required this.label,
    required this.address,
    required this.dotColor,
    required this.isLast,
    required this.onOpenMaps,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 20,
            child: Column(
              children: [
                const SizedBox(height: 3),
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: dotColor, width: 3.5),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, color: scheme.outlineVariant),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: text.labelMedium
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    address.isEmpty ? '—' : address,
                    style: text.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  if (onOpenMaps != null) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      key: mapsKey,
                      onPressed: onOpenMaps,
                      icon: const Icon(Icons.map_outlined, size: 18),
                      label: Text(l10n.openInMaps),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(64, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        textStyle: text.labelLarge,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Sticky bottom bar with the primary action for the current status.
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
    final scheme = Theme.of(context).colorScheme;
    final state = ref.watch(tripDetailProvider(tripId));

    if (status == 'completed' || status == 'cancelled') {
      return const SizedBox.shrink();
    }

    final actions = _buildActions(context, ref, l10n, state.isActionLoading);
    if (actions.isEmpty) return const SizedBox.shrink();

    return Container(
      key: const Key('trip-action-bar'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(children: actions),
      ),
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref,
      AppLocalizations l10n, bool loading) {
    final danger = AppSemantic.of(context).danger.color;
    final success = AppSemantic.of(context).success.color;

    switch (status) {
      case 'assigned':
        return [
          Expanded(
            child: OutlinedButton(
              onPressed: loading
                  ? null
                  : () => _showRejectSheet(context, ref, l10n),
              style: OutlinedButton.styleFrom(
                foregroundColor: danger,
                side: BorderSide(color: danger.withValues(alpha: 0.6)),
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
              child: loading ? const ButtonSpinner() : Text(l10n.accept),
            ),
          ),
        ];
      case 'accepted':
        return [
          _NavButton(trip: trip),
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
              child: loading ? const ButtonSpinner() : Text(l10n.enRoute),
            ),
          ),
        ];
      case 'en_route':
        return [
          _NavButton(trip: trip),
          Expanded(
            flex: 2,
            child: FilledButton(
              key: const Key('action-check-in'),
              onPressed: loading
                  ? null
                  : () => context.push('/trips/$tripId/check-in'),
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
                backgroundColor: success,
                foregroundColor: onSolid(success),
              ),
              child: loading
                  ? ButtonSpinner(color: onSolid(success))
                  : Text(l10n.markCompleted),
            ),
          ),
        ];
      default:
        // Unknown status: keep the bar quiet rather than offering a wrong
        // action.
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
            style: FilledButton.styleFrom(minimumSize: const Size(96, 44)),
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
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            0,
            24,
            24 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.rejectTrip,
                style: Theme.of(ctx).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
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
                  decoration: InputDecoration(hintText: l10n.enterReason),
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
                  backgroundColor: AppSemantic.of(ctx).danger.color,
                  foregroundColor: onSolid(AppSemantic.of(ctx).danger.color),
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
    final address = view.pickupLocation;

    VoidCallback? onPressed;
    if (lat != null && lng != null) {
      onPressed = () => MapLauncher.navigate(
            lat: lat,
            lng: lng,
            address: address.isEmpty ? null : address,
          );
    } else if (address.trim().isNotEmpty) {
      onPressed = () => MapLauncher.openAddress(address);
    }
    if (onPressed == null) return const SizedBox.shrink();

    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(right: 12),
        child: OutlinedButton(
          key: const Key('action-navigate'),
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 8),
          ),
          // Icon + label scale down together so the label never wraps.
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.navigation_outlined, size: 18),
                const SizedBox(width: 6),
                Text(l10n.navigate, maxLines: 1, softWrap: false),
              ],
            ),
          ),
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
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
