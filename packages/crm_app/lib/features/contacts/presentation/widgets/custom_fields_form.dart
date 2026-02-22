import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';

class CustomFieldsFormSection extends StatelessWidget {
  final List<Map<String, dynamic>> fieldDefs;
  final Map<String, dynamic> values;
  final ValueChanged<Map<String, dynamic>> onChanged;

  const CustomFieldsFormSection({
    super.key,
    required this.fieldDefs,
    required this.values,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    if (fieldDefs.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final field in fieldDefs) ...[
          _buildField(context, field),
          const SizedBox(height: AppTheme.spacingMd),
        ],
      ],
    );
  }

  Widget _buildField(BuildContext context, Map<String, dynamic> field) {
    final name = field['name'] as String;
    final label = field['label'] as String;
    final type = field['fieldType'] as String;
    final options = field['options'] as List<dynamic>?;
    final currentValue = values[name]?.toString() ?? '';

    return switch (type) {
      'text' || 'number' || 'date' => AppTextField(
          label: label,
          controller: TextEditingController(text: currentValue),
          keyboardType: type == 'number' ? TextInputType.number : null,
          readOnly: type == 'date',
          onChanged: (v) => _updateValue(name, v),
          onTap: type == 'date' ? () => _pickDate(context, name) : null,
        ),
      'boolean' => SwitchListTile(
          title: Text(label),
          value: currentValue == 'true',
          onChanged: (v) => _updateValue(name, v.toString()),
          contentPadding: EdgeInsets.zero,
        ),
      'select' => DropdownButtonFormField<String>(
          decoration: InputDecoration(labelText: label),
          initialValue: currentValue.isNotEmpty ? currentValue : null,
          items: options
                  ?.map((o) => DropdownMenuItem(value: o.toString(), child: Text(o.toString())))
                  .toList() ??
              [],
          onChanged: (v) {
            if (v != null) _updateValue(name, v);
          },
        ),
      'multi_select' => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: (options ?? []).map((o) {
                final selected = currentValue.split(',').contains(o.toString());
                return FilterChip(
                  label: Text(o.toString()),
                  selected: selected,
                  onSelected: (sel) {
                    final current = currentValue.split(',').where((s) => s.isNotEmpty).toList();
                    if (sel) {
                      current.add(o.toString());
                    } else {
                      current.remove(o.toString());
                    }
                    _updateValue(name, current.join(','));
                  },
                );
              }).toList(),
            ),
          ],
        ),
      _ => AppTextField(
          label: label,
          controller: TextEditingController(text: currentValue),
          onChanged: (v) => _updateValue(name, v),
        ),
    };
  }

  void _updateValue(String name, String value) {
    final updated = Map<String, dynamic>.from(values);
    updated[name] = value;
    onChanged(updated);
  }

  Future<void> _pickDate(BuildContext context, String name) async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (date != null) {
      _updateValue(name, '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}');
    }
  }
}
