import 'package:flutter/material.dart';

class ContactTypeBadge extends StatelessWidget {
  final String type;
  const ContactTypeBadge({super.key, required this.type});

  @override
  Widget build(BuildContext context) {
    final color = _typeColor(type);
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        _capitalize(type),
        style: theme.textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }

  static Color _typeColor(String type) {
    return switch (type) {
      'customer' => const Color(0xFF1E88E5),
      'supplier' => const Color(0xFF26A69A),
      'agent' => const Color(0xFFFFA726),
      'partner' => const Color(0xFF7E57C2),
      _ => const Color(0xFF9E9E9E),
    };
  }

  static String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
