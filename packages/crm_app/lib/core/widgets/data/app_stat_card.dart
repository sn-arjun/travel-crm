import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// A compact dashboard stat card showing a metric with optional trend.
///
/// ```dart
/// AppStatCard(
///   icon: Icons.people,
///   title: 'Total Leads',
///   value: '1,248',
///   trend: 12.5,          // positive = up, negative = down
///   trendLabel: 'vs last month',
/// )
/// ```
class AppStatCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  /// Positive value renders green (up), negative renders red (down).
  /// Null hides the trend indicator entirely.
  final double? trend;
  final String? trendLabel;
  final Color? iconColor;
  final VoidCallback? onTap;
  final bool isAlert;

  const AppStatCard({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    this.trend,
    this.trendLabel,
    this.iconColor,
    this.onTap,
    this.isAlert = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final effectiveIconColor =
        isAlert ? AppTheme.warningColor : (iconColor ?? theme.colorScheme.primary);

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Icon + title row
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(AppTheme.spacingSm),
                    decoration: BoxDecoration(
                      color: effectiveIconColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Icon(icon, size: 20, color: effectiveIconColor),
                  ),
                  const SizedBox(width: AppTheme.spacingSm),
                  Expanded(
                    child: Text(
                      title,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppTheme.spacingSm),

              // Value
              Text(
                value,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),

              // Trend
              if (trend != null) ...[
                const SizedBox(height: AppTheme.spacingXs),
                _TrendBadge(trend: trend!, label: trendLabel),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Trend badge
// ---------------------------------------------------------------------------

class _TrendBadge extends StatelessWidget {
  final double trend;
  final String? label;

  const _TrendBadge({required this.trend, this.label});

  @override
  Widget build(BuildContext context) {
    final isPositive = trend >= 0;
    final color = isPositive ? AppTheme.successColor : AppTheme.errorColor;
    final icon = isPositive ? Icons.trending_up : Icons.trending_down;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 2),
        Text(
          '${isPositive ? '+' : ''}${trend.toStringAsFixed(1)}%',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
        if (label != null) ...[
          const SizedBox(width: 4),
          Text(
            label!,
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(context).textTheme.bodySmall?.color?.withValues(alpha: 0.5),
            ),
          ),
        ],
      ],
    );
  }
}
