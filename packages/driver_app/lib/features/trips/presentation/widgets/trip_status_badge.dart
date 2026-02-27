import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

class TripStatusBadge extends StatelessWidget {
  final String status;

  const TripStatusBadge({super.key, required this.status});

  String get _label {
    switch (status) {
      case 'assigned':
        return 'Assigned';
      case 'accepted':
        return 'Accepted';
      case 'en_route':
        return 'En Route';
      case 'started':
        return 'Started';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = AppColors.statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
