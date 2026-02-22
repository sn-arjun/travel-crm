import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../../core/widgets/layout/app_section_card.dart';
import '../auth/data/auth_provider.dart';

// ── Provider ─────────────────────────────────────────────

final _routingRulesProvider =
    FutureProvider.autoDispose<List<Map<String, String>>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.settingsRoutingRules);
  final list = response.data['data'] as List;
  return list.cast<Map<String, String>>();
});

// ── Screen ────────────────────────────────────────────────

class RoutingRulesScreen extends ConsumerStatefulWidget {
  const RoutingRulesScreen({super.key});

  @override
  ConsumerState<RoutingRulesScreen> createState() =>
      _RoutingRulesScreenState();
}

class _RoutingRulesScreenState extends ConsumerState<RoutingRulesScreen> {
  final List<Map<String, String>> _rules = [];
  bool _loaded = false;

  static const _sources = [
    'manual', 'website', 'facebook', 'google', 'referral', 'walkin',
  ];

  Future<void> _save() async {
    try {
      final api = ref.read(apiClientProvider);
      await api.put(ApiEndpoints.settingsRoutingRules, data: _rules);
      if (!mounted) return;
      AppSnackbar.success(context, 'Routing rules saved');
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to save routing rules');
    }
  }

  Future<void> _showAddDialog() async {
    String? source;
    String? userId;

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Routing Rule'),
        content: StatefulBuilder(
          builder: (ctx, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'Source',
                  border: OutlineInputBorder(),
                ),
                items: _sources
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => setState(() => source = v),
              ),
              const SizedBox(height: AppTheme.spacingMd),
              TextFormField(
                decoration: const InputDecoration(
                  labelText: 'Assign to User ID',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => userId = v,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (source != null && userId != null && userId!.isNotEmpty) {
                setState(() => _rules.add({
                      'source': source!,
                      'assignToUserId': userId!,
                    }));
                Navigator.pop(ctx);
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_routingRulesProvider);

    if (!_loaded) {
      async.whenData((rules) {
        _rules
          ..clear()
          ..addAll(rules.map((r) => Map<String, String>.from(r)));
        _loaded = true;
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Source Routing Rules'),
        actions: [
          TextButton(onPressed: _save, child: const Text('Save')),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddDialog,
        child: const Icon(Icons.add),
      ),
      body: async.when(
        loading: () => const Center(child: AppLoading()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (_) => _rules.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.rule, size: 48, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      'No routing rules configured',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text('Tap + to add a rule'),
                  ],
                ),
              )
            : AppSectionCard(
                title: 'Rules (${_rules.length})',
                child: Column(
                  children: [
                    for (var i = 0; i < _rules.length; i++)
                      ListTile(
                        leading: const Icon(Icons.arrow_forward),
                        title: Text(_rules[i]['source'] ?? ''),
                        subtitle: Text(
                            'Assign to: ${_rules[i]['assignToUserId'] ?? ''}'),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline,
                              color: Colors.red),
                          onPressed: () =>
                              setState(() => _rules.removeAt(i)),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}
