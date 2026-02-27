import 'package:flutter/material.dart';
import '../screens/flyer_editor_screen.dart';

/// Side panel for editing properties of the selected canvas element.
class ElementPropertiesPanel extends StatelessWidget {
  final CanvasElement element;
  final void Function(String key, dynamic value) onPropertyChanged;
  final VoidCallback onDelete;

  const ElementPropertiesPanel({
    super.key,
    required this.element,
    required this.onPropertyChanged,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(left: BorderSide(color: Colors.grey[300]!)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  element.type.toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                  onPressed: onDelete,
                ),
              ],
            ),
            const Divider(),

            // Position
            Text('Position', style: _sectionStyle),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _NumberField(
                    label: 'X',
                    value: element.x,
                    onChanged: (v) {
                      element.x = v;
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _NumberField(
                    label: 'Y',
                    value: element.y,
                    onChanged: (v) {
                      element.y = v;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _NumberField(
                    label: 'W',
                    value: element.width,
                    onChanged: (v) {
                      element.width = v;
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _NumberField(
                    label: 'H',
                    value: element.height,
                    onChanged: (v) {
                      element.height = v;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Type-specific properties
            if (element.type == 'text') _buildTextProperties(),
            if (element.type == 'image') _buildImageProperties(),
            if (element.type == 'shape') _buildShapeProperties(),
          ],
        ),
      ),
    );
  }

  Widget _buildTextProperties() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Text', style: _sectionStyle),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(
            text: element.properties['text'] ?? '',
          ),
          decoration: const InputDecoration(
            labelText: 'Content',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          maxLines: 3,
          onChanged: (v) => onPropertyChanged('text', v),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: TextEditingController(
                  text: (element.properties['fontSize'] ?? 24).toString(),
                ),
                decoration: const InputDecoration(
                  labelText: 'Size',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                keyboardType: TextInputType.number,
                onChanged: (v) =>
                    onPropertyChanged('fontSize', int.tryParse(v) ?? 24),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: TextEditingController(
                  text: element.properties['color'] ?? '#000000',
                ),
                decoration: const InputDecoration(
                  labelText: 'Color',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (v) => onPropertyChanged('color', v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: element.properties['fontWeight'] ?? 'normal',
                decoration: const InputDecoration(
                  labelText: 'Weight',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(value: 'normal', child: Text('Normal')),
                  DropdownMenuItem(value: 'bold', child: Text('Bold')),
                ],
                onChanged: (v) => onPropertyChanged('fontWeight', v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: element.properties['textAlign'] ?? 'left',
                decoration: const InputDecoration(
                  labelText: 'Align',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(value: 'left', child: Text('Left')),
                  DropdownMenuItem(value: 'center', child: Text('Center')),
                  DropdownMenuItem(value: 'right', child: Text('Right')),
                ],
                onChanged: (v) => onPropertyChanged('textAlign', v),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildImageProperties() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Image', style: _sectionStyle),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(
            text: element.properties['url'] ?? '',
          ),
          decoration: const InputDecoration(
            labelText: 'Image URL',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (v) => onPropertyChanged('url', v),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: element.properties['fit'] ?? 'cover',
          decoration: const InputDecoration(
            labelText: 'Fit',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          items: const [
            DropdownMenuItem(value: 'cover', child: Text('Cover')),
            DropdownMenuItem(value: 'contain', child: Text('Contain')),
            DropdownMenuItem(value: 'fill', child: Text('Fill')),
          ],
          onChanged: (v) => onPropertyChanged('fit', v),
        ),
      ],
    );
  }

  Widget _buildShapeProperties() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Shape', style: _sectionStyle),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(
            text: element.properties['fillColor'] ?? '#E3F2FD',
          ),
          decoration: const InputDecoration(
            labelText: 'Fill Color',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (v) => onPropertyChanged('fillColor', v),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(
            text: element.properties['borderColor'] ?? '#1976D2',
          ),
          decoration: const InputDecoration(
            labelText: 'Border Color',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (v) => onPropertyChanged('borderColor', v),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(
            text: (element.properties['borderWidth'] ?? 2).toString(),
          ),
          decoration: const InputDecoration(
            labelText: 'Border Width',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          keyboardType: TextInputType.number,
          onChanged: (v) =>
              onPropertyChanged('borderWidth', int.tryParse(v) ?? 2),
        ),
      ],
    );
  }

  static const _sectionStyle = TextStyle(
    fontWeight: FontWeight.w600,
    fontSize: 12,
    color: Colors.grey,
  );
}

class _NumberField extends StatelessWidget {
  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  const _NumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: TextEditingController(text: value.toStringAsFixed(0)),
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      keyboardType: TextInputType.number,
      onChanged: (v) => onChanged(double.tryParse(v) ?? value),
    );
  }
}
