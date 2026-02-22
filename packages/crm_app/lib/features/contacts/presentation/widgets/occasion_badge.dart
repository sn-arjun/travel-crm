import 'package:flutter/material.dart';

class OccasionBadge extends StatelessWidget {
  final String occasionType;
  final int daysUntil;

  const OccasionBadge({
    super.key,
    required this.occasionType,
    required this.daysUntil,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isBirthday = occasionType == 'birthday';
    final icon = isBirthday ? Icons.cake_outlined : Icons.favorite_outline;
    final color = isBirthday ? const Color(0xFFE91E63) : const Color(0xFFFF5722);
    final label = daysUntil == 0
        ? 'Today!'
        : daysUntil == 1
            ? 'Tomorrow'
            : 'In $daysUntil days';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
