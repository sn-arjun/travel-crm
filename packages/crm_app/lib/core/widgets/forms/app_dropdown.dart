import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// A type-safe dropdown with optional search functionality for long lists.
///
/// [T] is the value type of each item. [displayStringFor] converts [T] to a
/// display label. When [searchable] is true a text field is shown inside the
/// dropdown menu to filter items.
class AppDropdown<T> extends StatefulWidget {
  final String? label;
  final String? hint;
  final List<T> items;
  final T? value;
  final ValueChanged<T?>? onChanged;
  final String Function(T) displayStringFor;
  final bool searchable;
  final String? Function(T?)? validator;
  final bool enabled;

  const AppDropdown({
    super.key,
    this.label,
    this.hint,
    required this.items,
    this.value,
    this.onChanged,
    required this.displayStringFor,
    this.searchable = false,
    this.validator,
    this.enabled = true,
  });

  @override
  State<AppDropdown<T>> createState() => _AppDropdownState<T>();
}

class _AppDropdownState<T> extends State<AppDropdown<T>> {
  final _searchController = TextEditingController();
  List<T> _filteredItems = [];

  @override
  void initState() {
    super.initState();
    _filteredItems = widget.items;
  }

  @override
  void didUpdateWidget(covariant AppDropdown<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.items != widget.items) {
      _filteredItems = widget.items;
      _searchController.clear();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Non-searchable: standard DropdownButtonFormField
  Widget _buildStandardDropdown(BuildContext context) {
    return DropdownButtonFormField<T>(
      initialValue: widget.value,
      hint: widget.hint != null ? Text(widget.hint!) : null,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: widget.label,
      ),
      validator: widget.validator,
      onChanged: widget.enabled ? widget.onChanged : null,
      items: widget.items
          .map((item) => DropdownMenuItem<T>(
                value: item,
                child: Text(widget.displayStringFor(item)),
              ))
          .toList(),
    );
  }

  // Searchable: opens a dialog with a search field + list
  Widget _buildSearchableDropdown(BuildContext context) {
    final theme = Theme.of(context);
    final displayText = widget.value != null ? widget.displayStringFor(widget.value as T) : null;

    return FormField<T>(
      validator: widget.validator,
      builder: (state) {
        return InkWell(
          onTap: widget.enabled ? () => _openSearchDialog(context, state) : null,
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: widget.label,
              hintText: widget.hint,
              errorText: state.errorText,
              suffixIcon: const Icon(Icons.arrow_drop_down),
            ),
            child: displayText != null
                ? Text(displayText, style: theme.textTheme.bodyLarge)
                : null,
          ),
        );
      },
    );
  }

  Future<void> _openSearchDialog(BuildContext context, FormFieldState<T> fieldState) async {
    _searchController.clear();
    _filteredItems = widget.items;

    final result = await showDialog<T>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: widget.label != null ? Text(widget.label!) : null,
              contentPadding: const EdgeInsets.fromLTRB(
                AppTheme.spacingMd, AppTheme.spacingMd, AppTheme.spacingMd, 0,
              ),
              content: SizedBox(
                width: 320,
                height: 400,
                child: Column(
                  children: [
                    TextField(
                      controller: _searchController,
                      autofocus: true,
                      decoration: const InputDecoration(
                        hintText: 'Search...',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (query) {
                        setDialogState(() {
                          _filteredItems = widget.items.where((item) {
                            return widget
                                .displayStringFor(item)
                                .toLowerCase()
                                .contains(query.toLowerCase());
                          }).toList();
                        });
                      },
                    ),
                    const SizedBox(height: AppTheme.spacingSm),
                    Expanded(
                      child: _filteredItems.isEmpty
                          ? const Center(child: Text('No items found'))
                          : ListView.builder(
                              itemCount: _filteredItems.length,
                              itemBuilder: (_, i) {
                                final item = _filteredItems[i];
                                final isSelected = item == widget.value;
                                return ListTile(
                                  title: Text(widget.displayStringFor(item)),
                                  selected: isSelected,
                                  trailing: isSelected ? const Icon(Icons.check, size: 18) : null,
                                  onTap: () => Navigator.of(ctx).pop(item),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Cancel'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result != null) {
      fieldState.didChange(result);
      widget.onChanged?.call(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.searchable
        ? _buildSearchableDropdown(context)
        : _buildStandardDropdown(context);
  }
}
