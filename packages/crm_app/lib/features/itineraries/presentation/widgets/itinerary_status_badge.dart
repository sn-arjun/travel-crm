import 'package:flutter/material.dart';

/// A styled chip that displays an itinerary's status with an appropriate color.
///
/// Supported statuses:
/// - `draft`    -> grey
/// - `sent`     -> blue
/// - `approved` -> green
/// - `rejected` -> red
/// - `expired`  -> orange
class ItineraryStatusBadge extends StatelessWidget {
  final String status;

  const ItineraryStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Color color, String label) = switch (status.toLowerCase()) {
      'draft' => (Colors.grey, 'Draft'),
      'sent' => (Colors.blue, 'Sent'),
      'approved' => (Colors.green, 'Approved'),
      'rejected' => (Colors.red, 'Rejected'),
      'expired' => (Colors.orange, 'Expired'),
      _ => (Colors.grey, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
