import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// A [Card] with a title header row and body content.
///
/// Commonly used to group related content on detail/form pages.
///
/// ```dart
/// AppSectionCard(
///   title: 'Contact Details',
///   trailing: TextButton(onPressed: _edit, child: Text('Edit')),
///   child: Column(children: [ ... ]),
/// )
/// ```
class AppSectionCard extends StatelessWidget {
  final String title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry? padding;

  const AppSectionCard({
    super.key,
    required this.title,
    this.trailing,
    required this.child,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: padding ?? const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                ?trailing,
              ],
            ),
            const SizedBox(height: AppTheme.spacingSm),
            const Divider(height: 1),
            const SizedBox(height: AppTheme.spacingMd),

            // Body
            child,
          ],
        ),
      ),
    );
  }
}
