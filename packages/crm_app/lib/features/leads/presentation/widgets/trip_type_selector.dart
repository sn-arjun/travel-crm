import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// A horizontal wrap of [ChoiceChip]s for selecting a trip type.
class TripTypeSelector extends StatelessWidget {
  final String? value;
  final ValueChanged<String?> onChanged;

  static const _types = [
    (value: 'domestic', label: 'Domestic', icon: Icons.home_outlined),
    (value: 'international', label: 'International', icon: Icons.flight_outlined),
    (value: 'honeymoon', label: 'Honeymoon', icon: Icons.favorite_outline),
    (value: 'family', label: 'Family', icon: Icons.family_restroom),
    (value: 'group', label: 'Group', icon: Icons.groups_outlined),
    (value: 'corporate', label: 'Corporate', icon: Icons.business_center_outlined),
    (value: 'adventure', label: 'Adventure', icon: Icons.terrain_outlined),
    (value: 'pilgrimage', label: 'Pilgrimage', icon: Icons.temple_hindu_outlined),
  ];

  const TripTypeSelector({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Trip Type',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: AppTheme.spacingXs),
        Wrap(
          spacing: AppTheme.spacingXs,
          runSpacing: AppTheme.spacingXs,
          children: _types.map((t) {
            final selected = value == t.value;
            return ChoiceChip(
              avatar: Icon(
                t.icon,
                size: 16,
                color: selected
                    ? Theme.of(context).colorScheme.onSecondaryContainer
                    : null,
              ),
              label: Text(t.label),
              selected: selected,
              onSelected: (_) => onChanged(selected ? null : t.value),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            );
          }).toList(),
        ),
      ],
    );
  }
}
