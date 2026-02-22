import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class TagChips extends StatelessWidget {
  final List<String> tags;
  final ValueChanged<String>? onTagTap;
  final int maxVisible;

  const TagChips({
    super.key,
    required this.tags,
    this.onTagTap,
    this.maxVisible = 5,
  });

  @override
  Widget build(BuildContext context) {
    if (tags.isEmpty) return const SizedBox.shrink();

    final visible = tags.take(maxVisible).toList();
    final remaining = tags.length - maxVisible;

    return Wrap(
      spacing: AppTheme.spacingXs,
      runSpacing: AppTheme.spacingXs,
      children: [
        ...visible.map((tag) => ActionChip(
              label: Text(tag),
              labelStyle: Theme.of(context).textTheme.labelSmall,
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              onPressed: () => onTagTap?.call(tag),
            )),
        if (remaining > 0)
          Chip(
            label: Text('+$remaining'),
            labelStyle: Theme.of(context).textTheme.labelSmall,
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
      ],
    );
  }
}

class TagAutocompleteField extends StatelessWidget {
  final List<String> allTags;
  final List<String> selectedTags;
  final ValueChanged<List<String>> onChanged;

  const TagAutocompleteField({
    super.key,
    required this.allTags,
    required this.selectedTags,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Autocomplete<String>(
          optionsBuilder: (textEditingValue) {
            if (textEditingValue.text.isEmpty) return const Iterable.empty();
            return allTags.where((tag) =>
                tag.toLowerCase().contains(textEditingValue.text.toLowerCase()) &&
                !selectedTags.contains(tag));
          },
          onSelected: (tag) {
            onChanged([...selectedTags, tag]);
          },
          fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
            return TextField(
              controller: controller,
              focusNode: focusNode,
              decoration: const InputDecoration(
                labelText: 'Tags',
                hintText: 'Type to search or add tags',
                prefixIcon: Icon(Icons.label_outline),
              ),
              onSubmitted: (value) {
                if (value.trim().isNotEmpty && !selectedTags.contains(value.trim())) {
                  onChanged([...selectedTags, value.trim()]);
                  controller.clear();
                }
              },
            );
          },
        ),
        if (selectedTags.isNotEmpty) ...[
          const SizedBox(height: AppTheme.spacingSm),
          Wrap(
            spacing: AppTheme.spacingXs,
            runSpacing: AppTheme.spacingXs,
            children: selectedTags.map((tag) => Chip(
                  label: Text(tag),
                  onDeleted: () {
                    onChanged(selectedTags.where((t) => t != tag).toList());
                  },
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                )).toList(),
          ),
        ],
      ],
    );
  }
}
