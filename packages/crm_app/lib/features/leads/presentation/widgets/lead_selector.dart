import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../features/auth/data/auth_provider.dart';

// ── Debounced lead search provider ───────────────────────────

final _leadSearchProvider =
    FutureProvider.autoDispose.family<List<LeadModel>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiClientProvider);
  final response = await api.get(
    ApiEndpoints.leads,
    queryParameters: {'search': query, 'limit': '20'},
  );
  final items = (response.data['data'] as List?) ?? [];
  return items
      .map((e) => LeadModel.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── LeadSelector ────────────────────────────────────────────

/// Autocomplete widget for selecting a lead.
class LeadSelector extends ConsumerStatefulWidget {
  /// Currently selected lead id.
  final String? leadId;

  /// Currently selected lead title/name.
  final String? leadTitle;
  
  /// Optional contact id to filter leads by.
  final String? contactId;

  final ValueChanged<LeadModel?> onChanged;

  const LeadSelector({
    super.key,
    required this.leadId,
    required this.leadTitle,
    this.contactId,
    required this.onChanged,
  });

  @override
  ConsumerState<LeadSelector> createState() => _LeadSelectorState();
}

class _LeadSelectorState extends ConsumerState<LeadSelector> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    if (widget.leadTitle != null) {
      _controller.text = widget.leadTitle!;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(_leadSearchProvider(_query));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Autocomplete<LeadModel>(
          optionsBuilder: (_) {
            return results.maybeWhen(
              data: (d) {
                if (widget.contactId != null) {
                  return d.where((l) => l.contactId == widget.contactId).toList();
                }
                return d;
              }, 
              orElse: () => []
            );
          },
          displayStringForOption: (l) => l.title,
          onSelected: (l) {
            _controller.text = l.title;
            _query = '';
            widget.onChanged(l);
          },
          fieldViewBuilder: (ctx, textCtrl, focusNode, onFieldSubmitted) {
            if (textCtrl.text != _controller.text &&
                _query.isEmpty &&
                widget.leadTitle != null) {
              textCtrl.text = widget.leadTitle!;
            }
            return TextField(
              controller: textCtrl,
              focusNode: focusNode,
              decoration: InputDecoration(
                labelText: 'Lead',
                hintText: 'Search leads...',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.leaderboard_outlined),
                suffixIcon: widget.leadId != null
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
                  constraints: const BoxConstraints(maxHeight: 240, maxWidth: 400),
                  child: ListView.separated(
                    padding: EdgeInsets.zero,
                    shrinkWrap: true,
                    itemCount: options.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final l = options.elementAt(i);
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.leaderboard),
                        title: Text(l.title),
                        subtitle: Text(l.destinations.isNotEmpty ? l.destinations.join(', ') : ''),
                        onTap: () => onSelected(l),
                      );
                    },
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
