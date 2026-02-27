import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Pre-defined suggestions for inclusions and exclusions.
const _suggestions = [
  'Breakfast at hotel',
  'Airport transfers',
  'Sightseeing',
  'Visa fees',
  'Personal expenses',
  'Travel insurance',
  'Meals not mentioned',
  'Entry tickets',
];

/// Editable chip-list editor for inclusions and exclusions (TICKET-088).
///
/// Each section has a list of chips with delete buttons, a text field to
/// add new items, and a dropdown of pre-defined suggestions.
class InclusionsExclusionsEditor extends StatefulWidget {
  final List<String> inclusions;
  final List<String> exclusions;
  final ValueChanged<String> onAddInclusion;
  final ValueChanged<String> onRemoveInclusion;
  final ValueChanged<String> onAddExclusion;
  final ValueChanged<String> onRemoveExclusion;

  const InclusionsExclusionsEditor({
    super.key,
    required this.inclusions,
    required this.exclusions,
    required this.onAddInclusion,
    required this.onRemoveInclusion,
    required this.onAddExclusion,
    required this.onRemoveExclusion,
  });

  @override
  State<InclusionsExclusionsEditor> createState() =>
      _InclusionsExclusionsEditorState();
}

class _InclusionsExclusionsEditorState
    extends State<InclusionsExclusionsEditor> {
  final _inclusionController = TextEditingController();
  final _exclusionController = TextEditingController();

  @override
  void dispose() {
    _inclusionController.dispose();
    _exclusionController.dispose();
    super.dispose();
  }

  void _addInclusion() {
    final text = _inclusionController.text.trim();
    if (text.isEmpty) return;
    if (widget.inclusions.contains(text)) return;
    widget.onAddInclusion(text);
    _inclusionController.clear();
  }

  void _addExclusion() {
    final text = _exclusionController.text.trim();
    if (text.isEmpty) return;
    if (widget.exclusions.contains(text)) return;
    widget.onAddExclusion(text);
    _exclusionController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Inclusions ────────────────────────────────────
          _SectionHeader(
            title: 'Inclusions',
            icon: Icons.check_circle_outline,
            color: AppTheme.successColor,
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _buildChipList(
            items: widget.inclusions,
            onDelete: widget.onRemoveInclusion,
            chipColor: AppTheme.successColor,
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _buildInputRow(
            controller: _inclusionController,
            hintText: 'Add inclusion...',
            onAdd: _addInclusion,
            existingItems: widget.inclusions,
            onSuggestionSelected: (suggestion) {
              if (!widget.inclusions.contains(suggestion)) {
                widget.onAddInclusion(suggestion);
              }
            },
          ),

          const SizedBox(height: AppTheme.spacingLg),
          const Divider(),
          const SizedBox(height: AppTheme.spacingLg),

          // ── Exclusions ────────────────────────────────────
          _SectionHeader(
            title: 'Exclusions',
            icon: Icons.cancel_outlined,
            color: AppTheme.errorColor,
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _buildChipList(
            items: widget.exclusions,
            onDelete: widget.onRemoveExclusion,
            chipColor: AppTheme.errorColor,
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _buildInputRow(
            controller: _exclusionController,
            hintText: 'Add exclusion...',
            onAdd: _addExclusion,
            existingItems: widget.exclusions,
            onSuggestionSelected: (suggestion) {
              if (!widget.exclusions.contains(suggestion)) {
                widget.onAddExclusion(suggestion);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildChipList({
    required List<String> items,
    required ValueChanged<String> onDelete,
    required Color chipColor,
  }) {
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingSm),
        child: Text(
          'No items added yet',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.5),
              ),
        ),
      );
    }

    return Wrap(
      spacing: AppTheme.spacingSm,
      runSpacing: AppTheme.spacingSm,
      children: items.map((item) {
        return Chip(
          label: Text(item),
          deleteIcon: const Icon(Icons.close, size: 16),
          onDeleted: () => onDelete(item),
          backgroundColor: chipColor.withValues(alpha: 0.1),
          labelStyle: TextStyle(
            color: chipColor,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
          deleteIconColor: chipColor,
          side: BorderSide.none,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildInputRow({
    required TextEditingController controller,
    required String hintText,
    required VoidCallback onAdd,
    required List<String> existingItems,
    required ValueChanged<String> onSuggestionSelected,
  }) {
    // Filter out already-added suggestions
    final availableSuggestions =
        _suggestions.where((s) => !existingItems.contains(s)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  hintText: hintText,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
                onSubmitted: (_) => onAdd(),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            FilledButton(
              onPressed: onAdd,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: 10,
                ),
              ),
              child: const Text('Add'),
            ),
          ],
        ),
        if (availableSuggestions.isNotEmpty) ...[
          const SizedBox(height: AppTheme.spacingSm),
          Text(
            'Suggestions:',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.5),
                ),
          ),
          const SizedBox(height: AppTheme.spacingXs),
          Wrap(
            spacing: AppTheme.spacingXs,
            runSpacing: AppTheme.spacingXs,
            children: availableSuggestions.map((suggestion) {
              return ActionChip(
                label: Text(suggestion),
                onPressed: () => onSuggestionSelected(suggestion),
                labelStyle: Theme.of(context).textTheme.labelSmall,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              );
            }).toList(),
          ),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;

  const _SectionHeader({
    required this.title,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: AppTheme.spacingSm),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: color,
              ),
        ),
      ],
    );
  }
}
