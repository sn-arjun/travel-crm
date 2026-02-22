import 'package:flutter/material.dart';

class SourceBadge extends StatelessWidget {
  final String? source;
  const SourceBadge({super.key, this.source});

  @override
  Widget build(BuildContext context) {
    if (source == null || source!.isEmpty) return const SizedBox.shrink();

    final (icon, color) = _sourceStyle(source!);
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            _capitalize(source!),
            style: theme.textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  static (IconData, Color) _sourceStyle(String source) {
    return switch (source) {
      'manual' => (Icons.edit_outlined, const Color(0xFF607D8B)),
      'website' => (Icons.language_outlined, const Color(0xFF1E88E5)),
      'facebook' => (Icons.facebook_outlined, const Color(0xFF1877F2)),
      'google' => (Icons.search, const Color(0xFFEA4335)),
      'referral' => (Icons.people_outline, const Color(0xFF4CAF50)),
      'ad' => (Icons.campaign_outlined, const Color(0xFFFFA726)),
      _ => (Icons.help_outline, const Color(0xFF9E9E9E)),
    };
  }

  static String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
