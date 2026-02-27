import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/app_colors.dart';
import 'trip_status_badge.dart';

class TripCard extends StatelessWidget {
  final Map<String, dynamic> trip;

  const TripCard({super.key, required this.trip});

  @override
  Widget build(BuildContext context) {
    final status = trip['status'] as String? ?? 'assigned';
    final pickup = trip['pickupLocation'] as String? ?? '';
    final drop = trip['dropLocation'] as String? ?? '';
    final passenger = trip['passengerName'] as String? ?? '';
    final vehicle = trip['vehicleRegistration'] as String? ?? '';
    final dateTime = trip['pickupDatetime'] as String? ?? '';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/trips/${trip['id']}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      dateTime.isNotEmpty
                          ? _formatDateTime(dateTime)
                          : 'No date',
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  TripStatusBadge(status: status),
                ],
              ),
              const SizedBox(height: 12),
              _LocationRow(
                icon: Icons.trip_origin,
                color: AppColors.success,
                text: pickup,
              ),
              Padding(
                padding: const EdgeInsets.only(left: 11),
                child: Container(
                  width: 2,
                  height: 16,
                  color: Colors.grey[300],
                ),
              ),
              _LocationRow(
                icon: Icons.location_on,
                color: AppColors.error,
                text: drop,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (passenger.isNotEmpty) ...[
                    Icon(Icons.person_outline, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      passenger,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    const Spacer(),
                  ],
                  if (vehicle.isNotEmpty) ...[
                    Icon(Icons.directions_car_outlined,
                        size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      vehicle,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDateTime(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    final min = dt.minute.toString().padLeft(2, '0');
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}, $hour:$min $amPm';
  }
}

class _LocationRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;

  const _LocationRow({
    required this.icon,
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 22, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text.isEmpty ? '—' : text,
            style: const TextStyle(fontSize: 14),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
