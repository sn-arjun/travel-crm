import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// A centered loading indicator with an optional message below.
///
/// ```dart
/// AppLoading()                          // spinner only
/// AppLoading(message: 'Loading...')     // spinner + label
/// ```
class AppLoading extends StatelessWidget {
  final String? message;
  final double size;

  const AppLoading({
    super.key,
    this.message,
    this.size = 32,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: const CircularProgressIndicator(strokeWidth: 3),
          ),
          if (message != null) ...[
            const SizedBox(height: AppTheme.spacingMd),
            Text(
              message!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.6),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}
