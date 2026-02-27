import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../features/auth/data/auth_provider.dart';

// ── Debounced contact search provider ───────────────────────────

final _contactSearchProvider =
    FutureProvider.autoDispose.family<List<ContactModel>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiClientProvider);
  final response = await api.get(
    ApiEndpoints.contacts,
    queryParameters: {'search': query, 'limit': '20'},
  );
  final items = (response.data['data'] as List?) ?? [];
  return items
      .map((e) => ContactModel.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── ContactSelector ────────────────────────────────────────────

/// Autocomplete widget for selecting or creating a contact.
class ContactSelector extends ConsumerStatefulWidget {
  /// Currently selected contact id.
  final String? contactId;

  /// Currently selected contact display name.
  final String? contactName;

  final ValueChanged<ContactModel?> onChanged;

  const ContactSelector({
    super.key,
    required this.contactId,
    required this.contactName,
    required this.onChanged,
  });

  @override
  ConsumerState<ContactSelector> createState() => _ContactSelectorState();
}

class _ContactSelectorState extends ConsumerState<ContactSelector> {
  final _controller = TextEditingController();
  String _query = '';
  bool _showInlineForm = false;

  // Inline quick-create fields
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    if (widget.contactName != null) {
      _controller.text = widget.contactName!;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _createContact() async {
    final name = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    if (name.isEmpty || phone.isEmpty) return;

    setState(() => _creating = true);
    try {
      final api = ref.read(apiClientProvider);
      final resp = await api.post(ApiEndpoints.contacts, data: {
        'name': name,
        'phone': phone,
        if (_emailCtrl.text.trim().isNotEmpty) 'email': _emailCtrl.text.trim(),
        'type': 'customer',
        'source': 'manual',
      });
      final contact = ContactModel.fromJson(
          resp.data['data'] as Map<String, dynamic>);
      _controller.text = contact.name;
      widget.onChanged(contact);
      setState(() {
        _showInlineForm = false;
        _creating = false;
      });
      _nameCtrl.clear();
      _phoneCtrl.clear();
      _emailCtrl.clear();
    } catch (_) {
      setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(_contactSearchProvider(_query));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Autocomplete<ContactModel>(
          optionsBuilder: (_) {
            return results.maybeWhen(data: (d) => d, orElse: () => []);
          },
          displayStringForOption: (c) => c.name,
          onSelected: (c) {
            _controller.text = c.name;
            _query = '';
            widget.onChanged(c);
          },
          fieldViewBuilder: (ctx, textCtrl, focusNode, onFieldSubmitted) {
            // Sync external controller text into Autocomplete's internal one
            if (textCtrl.text != _controller.text &&
                _query.isEmpty &&
                widget.contactName != null) {
              textCtrl.text = widget.contactName!;
            }
            return TextField(
              controller: textCtrl,
              focusNode: focusNode,
              decoration: InputDecoration(
                labelText: 'Contact *',
                hintText: 'Search by name or phone',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.person_search_outlined),
                suffixIcon: widget.contactId != null
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          textCtrl.clear();
                          _query = '';
                          widget.onChanged(null);
                        },
                      )
                    : null,
              ),
              onChanged: (v) => setState(() => _query = v),
            );
          },
          optionsViewBuilder: (ctx, onSelected, options) {
            return Align(
              alignment: Alignment.topLeft,
              child: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 240),
                  child: ListView.separated(
                    padding: EdgeInsets.zero,
                    shrinkWrap: true,
                    itemCount: options.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final c = options.elementAt(i);
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.person_outline),
                        title: Text(c.name),
                        subtitle: Text(c.phone ?? ''),
                        onTap: () => onSelected(c),
                      );
                    },
                  ),
                ),
              ),
            );
          },
        ),
        const SizedBox(height: AppTheme.spacingXs),
        TextButton.icon(
          onPressed: () => setState(() => _showInlineForm = !_showInlineForm),
          icon: Icon(_showInlineForm ? Icons.expand_less : Icons.add, size: 16),
          label: Text(_showInlineForm ? 'Cancel' : 'Create New Contact'),
          style: TextButton.styleFrom(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
          ),
        ),
        if (_showInlineForm) ...[
          const SizedBox(height: AppTheme.spacingSm),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('New Contact',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: AppTheme.spacingSm),
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Full Name *',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingSm),
                  TextField(
                    controller: _phoneCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Phone *',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: AppTheme.spacingSm),
                  TextField(
                    controller: _emailCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: AppTheme.spacingMd),
                  FilledButton(
                    onPressed: _creating ? null : _createContact,
                    child: _creating
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Create & Select'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
