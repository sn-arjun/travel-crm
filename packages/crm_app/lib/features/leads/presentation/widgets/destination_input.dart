import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Chip-style multi-destination input widget.
///
/// Destinations are stored as a [List<String>]. The user can type a
/// destination name and press Enter (or the Add button) to add it to
/// the list, and tap the ✕ on any chip to remove it.
class DestinationInput extends StatefulWidget {
  final List<String> destinations;
  final ValueChanged<List<String>> onChanged;
  final String? labelText;

  const DestinationInput({
    super.key,
    required this.destinations,
    required this.onChanged,
    this.labelText = 'Destinations',
  });

  @override
  State<DestinationInput> createState() => _DestinationInputState();
}

class _DestinationInputState extends State<DestinationInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _add() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    if (!widget.destinations.contains(text)) {
      widget.onChanged([...widget.destinations, text]);
    }
    _controller.clear();
    _focusNode.requestFocus();
  }

  void _remove(String dest) {
    widget.onChanged(widget.destinations.where((d) => d != dest).toList());
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  labelText: widget.labelText,
                  hintText: 'e.g. Bali, Singapore',
                  border: const OutlineInputBorder(),
                ),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _add(),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            IconButton.filled(
              onPressed: _add,
              icon: const Icon(Icons.add),
              tooltip: 'Add destination',
            ),
          ],
        ),
        if (widget.destinations.isNotEmpty) ...[
          const SizedBox(height: AppTheme.spacingSm),
          Wrap(
            spacing: AppTheme.spacingXs,
            runSpacing: AppTheme.spacingXs,
            children: widget.destinations
                .map(
                  (d) => Chip(
                    label: Text(d),
                    onDeleted: () => _remove(d),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                )
                .toList(),
          ),
        ],
      ],
    );
  }
}
