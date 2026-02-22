import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/contact_provider.dart';

/// Admin panel for managing custom field definitions.
///
/// Used in Settings to let admins add/edit/delete EAV custom fields
/// that appear on all contact forms.
class CustomFieldsAdmin extends ConsumerStatefulWidget {
  const CustomFieldsAdmin({super.key});

  @override
  ConsumerState<CustomFieldsAdmin> createState() => _CustomFieldsAdminState();
}

class _CustomFieldsAdminState extends ConsumerState<CustomFieldsAdmin> {
  List<Map<String, dynamic>> _fieldDefs = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadFields();
  }

  Future<void> _loadFields() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final repo = ref.read(contactRepositoryProvider);
      final fields = await repo.getCustomFieldDefs();
      setState(() {
        _fieldDefs = fields;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e is ApiException ? e.message : 'Failed to load custom fields';
        _loading = false;
      });
    }
  }

  Future<void> _addField() async {
    final result = await _showFieldDialog();
    if (result == null) return;

    try {
      final repo = ref.read(contactRepositoryProvider);
      await repo.createCustomFieldDef(result);
      await _loadFields();
      if (mounted) AppSnackbar.success(context, 'Custom field created');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(
          context,
          e is ApiException ? e.message : 'Failed to create field',
        );
      }
    }
  }

  Future<void> _editField(Map<String, dynamic> field) async {
    final result = await _showFieldDialog(existing: field);
    if (result == null) return;

    try {
      final repo = ref.read(contactRepositoryProvider);
      await repo.updateCustomFieldDef(field['id'] as String, result);
      await _loadFields();
      if (mounted) AppSnackbar.success(context, 'Custom field updated');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(
          context,
          e is ApiException ? e.message : 'Failed to update field',
        );
      }
    }
  }

  Future<void> _deleteField(Map<String, dynamic> field) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Custom Field',
      message:
          'Are you sure you want to delete "${field['label']}"? All values for this field will be permanently deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    );

    if (!confirmed || !mounted) return;

    try {
      final repo = ref.read(contactRepositoryProvider);
      await repo.deleteCustomFieldDef(field['id'] as String);
      await _loadFields();
      if (mounted) AppSnackbar.success(context, 'Custom field deleted');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(
          context,
          e is ApiException ? e.message : 'Failed to delete field',
        );
      }
    }
  }

  Future<Map<String, dynamic>?> _showFieldDialog({
    Map<String, dynamic>? existing,
  }) async {
    final nameController = TextEditingController(text: existing?['name'] as String? ?? '');
    final labelController = TextEditingController(text: existing?['label'] as String? ?? '');
    final optionsController = TextEditingController(
      text: existing?['options'] != null
          ? (existing!['options'] as List).join(', ')
          : '',
    );
    var fieldType = existing?['fieldType'] as String? ?? 'text';
    var isRequired = (existing?['isRequired'] as int?) == 1;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            final showOptions = fieldType == 'select' || fieldType == 'multi_select';

            return AlertDialog(
              title: Text(existing != null ? 'Edit Custom Field' : 'Add Custom Field'),
              content: SizedBox(
                width: 400,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Field Name (key)',
                        hintText: 'e.g. passport_number',
                        border: OutlineInputBorder(),
                      ),
                      enabled: existing == null,
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    TextField(
                      controller: labelController,
                      decoration: const InputDecoration(
                        labelText: 'Display Label',
                        hintText: 'e.g. Passport Number',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DropdownButtonFormField<String>(
                      initialValue: fieldType,
                      decoration: const InputDecoration(
                        labelText: 'Field Type',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'text', child: Text('Text')),
                        DropdownMenuItem(value: 'number', child: Text('Number')),
                        DropdownMenuItem(value: 'date', child: Text('Date')),
                        DropdownMenuItem(value: 'boolean', child: Text('Boolean')),
                        DropdownMenuItem(value: 'select', child: Text('Select (single)')),
                        DropdownMenuItem(value: 'multi_select', child: Text('Multi-Select')),
                      ],
                      onChanged: existing != null
                          ? null
                          : (v) {
                              if (v != null) setDialogState(() => fieldType = v);
                            },
                    ),
                    if (showOptions) ...[
                      const SizedBox(height: AppTheme.spacingMd),
                      TextField(
                        controller: optionsController,
                        decoration: const InputDecoration(
                          labelText: 'Options (comma-separated)',
                          hintText: 'e.g. Option A, Option B, Option C',
                          border: OutlineInputBorder(),
                        ),
                        maxLines: 2,
                      ),
                    ],
                    const SizedBox(height: AppTheme.spacingSm),
                    SwitchListTile(
                      title: const Text('Required'),
                      value: isRequired,
                      onChanged: (v) => setDialogState(() => isRequired = v),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () {
                    final name = nameController.text.trim();
                    final label = labelController.text.trim();
                    if (name.isEmpty || label.isEmpty) return;

                    final data = <String, dynamic>{
                      'name': name,
                      'label': label,
                      'fieldType': fieldType,
                      'isRequired': isRequired ? 1 : 0,
                    };

                    if (showOptions) {
                      data['options'] = optionsController.text
                          .split(',')
                          .map((o) => o.trim())
                          .where((o) => o.isNotEmpty)
                          .toList();
                    }

                    Navigator.of(ctx).pop(data);
                  },
                  child: Text(existing != null ? 'Update' : 'Create'),
                ),
              ],
            );
          },
        );
      },
    );

    nameController.dispose();
    labelController.dispose();
    optionsController.dispose();

    return result;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            const SizedBox(height: AppTheme.spacingSm),
            OutlinedButton(onPressed: _loadFields, child: const Text('Retry')),
          ],
        ),
      );
    }

    return AppSectionCard(
      title: 'Custom Fields',
      trailing: FilledButton.icon(
        onPressed: _addField,
        icon: const Icon(Icons.add, size: 18),
        label: const Text('Add Field'),
      ),
      child: _fieldDefs.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingLg),
              child: Center(
                child: Text(
                  'No custom fields defined yet.\nCustom fields appear on all contact forms.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          : ReorderableListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _fieldDefs.length,
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex--;
                  final item = _fieldDefs.removeAt(oldIndex);
                  _fieldDefs.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final field = _fieldDefs[index];
                final type = field['fieldType'] as String? ?? 'text';
                final isRequired = (field['isRequired'] as int?) == 1;

                return ListTile(
                  key: ValueKey(field['id']),
                  leading: Icon(_iconForType(type), size: 20),
                  title: Text(field['label'] as String? ?? ''),
                  subtitle: Row(
                    children: [
                      Text(
                        type.replaceAll('_', ' '),
                        style: theme.textTheme.bodySmall,
                      ),
                      if (isRequired) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.error.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'Required',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.error,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        onPressed: () => _editField(field),
                        tooltip: 'Edit',
                      ),
                      IconButton(
                        icon: Icon(Icons.delete_outline, size: 18, color: theme.colorScheme.error),
                        onPressed: () => _deleteField(field),
                        tooltip: 'Delete',
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }

  IconData _iconForType(String type) {
    return switch (type) {
      'text' => Icons.text_fields,
      'number' => Icons.numbers,
      'date' => Icons.calendar_today,
      'boolean' => Icons.toggle_on_outlined,
      'select' => Icons.arrow_drop_down_circle_outlined,
      'multi_select' => Icons.checklist,
      _ => Icons.text_fields,
    };
  }
}
