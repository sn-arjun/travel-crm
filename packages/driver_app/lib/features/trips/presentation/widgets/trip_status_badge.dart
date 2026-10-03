import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

/// Status chip (icon + label) coloured by [TripStatusStyle], light/dark aware.
class TripStatusBadge extends StatelessWidget {
  final String status;

  /// Larger variant used in the trip detail header.
  final bool large;

  const TripStatusBadge({super.key, required this.status, this.large = false});

  @override
  Widget build(BuildContext context) {
    final style = TripStatusStyle.of(context, status);
    return Container(
      key: Key('status-chip-$status'),
      padding: EdgeInsets.symmetric(
        horizontal: large ? 14 : 10,
        vertical: large ? 8 : 5,
      ),
      decoration: BoxDecoration(
        color: style.container,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: style.color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: large ? 18 : 14, color: style.color),
          SizedBox(width: large ? 6 : 4),
          Text(
            style.label,
            style: TextStyle(
              color: style.onContainer,
              fontSize: large ? 14 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
