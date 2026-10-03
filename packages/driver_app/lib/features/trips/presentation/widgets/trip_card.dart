import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/trip_view.dart';
import 'trip_status_badge.dart';

class TripCard extends StatelessWidget {
  final Map<String, dynamic> trip;

  const TripCard({super.key, required this.trip});

  @override
  Widget build(BuildContext context) {
    final view = TripView(trip);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final passenger = view.passengerName ?? '';
    final vehicle = view.vehicleRegistration ?? '';
    final pickupAt = view.pickupAt;

    return Card(
      key: Key('trip-card-${view.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/trips/${view.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: pickupAt == null
                        ? Text('No date', style: text.titleMedium)
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                TripView.formatTime(pickupAt),
                                style: text.headlineSmall,
                              ),
                              Text(
                                TripView.relativeDate(
                                    pickupAt, DateTime.now()),
                                style: text.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                  ),
                  const SizedBox(width: 8),
                  TripStatusBadge(status: view.status),
                ],
              ),
              const SizedBox(height: 16),
              TripRoute(pickup: view.pickupLocation, drop: view.dropLocation),
              if (passenger.isNotEmpty || vehicle.isNotEmpty) ...[
                const SizedBox(height: 14),
                Divider(color: scheme.outlineVariant),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (passenger.isNotEmpty)
                      Expanded(
                        child: Row(
                          children: [
                            Icon(Icons.person_outline,
                                size: 18, color: scheme.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                passenger,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: text.bodyMedium?.copyWith(
                                    color: scheme.onSurfaceVariant),
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      const Spacer(),
                    if (vehicle.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      VehicleChip(registration: vehicle),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Pickup -> drop with route dots and a connecting line.
class TripRoute extends StatelessWidget {
  final String pickup;
  final String drop;

  const TripRoute({super.key, required this.pickup, required this.drop});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final semantic = AppSemantic.of(context);
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
                    border:
                        Border.all(color: semantic.success.color, width: 3.5),
                  ),
                ),
                Expanded(
                  child: Container(width: 2, color: scheme.outlineVariant),
                ),
                Icon(Icons.location_on, size: 20, color: semantic.danger.color),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pickup.isEmpty ? '—' : pickup,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 14),
                Text(
                  drop.isEmpty ? '—' : drop,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodyLarge,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Number-plate style chip for a vehicle registration.
class VehicleChip extends StatelessWidget {
  final String registration;

  const VehicleChip({super.key, required this.registration});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.directions_car_outlined,
              size: 16, color: scheme.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(
            registration,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: scheme.onSurface,
                ),
          ),
        ],
      ),
    );
  }
}
