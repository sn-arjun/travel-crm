import 'package:flutter/material.dart';

class PriorityBadge extends StatelessWidget {
  final String priority;
  final bool showLabel;

  const PriorityBadge({super.key, required this.priority, this.showLabel = true});

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = switch (priority) {
      'hot' => (Icons.local_fire_department, Colors.red, 'Hot'),
      'warm' => (Icons.wb_sunny, Colors.orange, 'Warm'),
      'cold' => (Icons.ac_unit, Colors.blue, 'Cold'),
      _ => (Icons.circle, Colors.grey, priority),
    };

    if (!showLabel) return Icon(icon, color: color, size: 18);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 14),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
