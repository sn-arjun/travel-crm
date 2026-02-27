import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../../core/widgets/layout/app_section_card.dart';
import '../auth/data/auth_provider.dart';

// ── Providers ─────────────────────────────────────────────

final _sequencesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.settingsFollowUpSequences);
  final list = response.data['data'] as List;
  return list.cast<Map<String, dynamic>>();
});

// ── Screen ────────────────────────────────────────────────

class FollowUpSequencesScreen extends ConsumerWidget {
  const FollowUpSequencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_sequencesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Follow-Up Sequences')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showSequenceBuilder(context, ref, null),
        child: const Icon(Icons.add),
      ),
      body: async.when(
        loading: () => const Center(child: AppLoading()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (sequences) => sequences.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.auto_fix_high, size: 48, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      'No sequences configured',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text('Tap + to create an auto follow-up sequence'),
                  ],
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16.0),
                itemCount: sequences.length,
                itemBuilder: (context, i) {
                  final seq = sequences[i];
                  final isActive = seq['isActive'] == 1 || seq['isActive'] == true;
                  final steps = seq['steps'] as List? ?? [];

                  return Card(
                    margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
                    child: ListTile(
                      leading: Icon(
                        Icons.auto_fix_high,
                        color: isActive
                            ? Theme.of(context).colorScheme.primary
                            : Colors.grey,
                      ),
                      title: Text(seq['name'] ?? ''),
                      subtitle: Text(
                        'Trigger: ${seq['triggerStatus']} · ${steps.length} step${steps.length == 1 ? '' : 's'}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Switch(
                            value: isActive,
                            onChanged: (v) =>
                                _toggleActive(context, ref, seq, v),
                          ),
                          IconButton(
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () =>
                                _showSequenceBuilder(context, ref, seq),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline,
                                color: Colors.red),
                            onPressed: () =>
                                _deleteSequence(context, ref, seq['id'] as String),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _toggleActive(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> seq,
    bool isActive,
  ) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.put(
        ApiEndpoints.settingsFollowUpSequence(seq['id'] as String),
        data: {'isActive': isActive},
      );
      ref.invalidate(_sequencesProvider);
    } catch (e) {
      if (!context.mounted) return;
      AppSnackbar.error(context, 'Failed to update sequence');
    }
  }

  Future<void> _deleteSequence(
    BuildContext context,
    WidgetRef ref,
    String id,
  ) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.delete(ApiEndpoints.settingsFollowUpSequence(id));
      ref.invalidate(_sequencesProvider);
      if (!context.mounted) return;
      AppSnackbar.success(context, 'Sequence deleted');
    } catch (e) {
      if (!context.mounted) return;
      AppSnackbar.error(context, 'Failed to delete sequence');
    }
  }

  Future<void> _showSequenceBuilder(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic>? existing,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => _SequenceBuilder(
        existing: existing,
        onSave: (data) async {
          try {
            final api = ref.read(apiClientProvider);
            if (existing != null) {
              await api.put(
                ApiEndpoints.settingsFollowUpSequence(
                    existing['id'] as String),
                data: data,
              );
            } else {
              await api.post(ApiEndpoints.settingsFollowUpSequences,
                  data: data);
            }
            ref.invalidate(_sequencesProvider);
            if (!ctx.mounted) return;
            Navigator.pop(ctx);
            AppSnackbar.success(
                context, existing != null ? 'Sequence updated' : 'Sequence created');
          } catch (e) {
            if (!ctx.mounted) return;
            AppSnackbar.error(ctx, 'Failed to save sequence');
          }
        },
      ),
    );
  }
}

// ── Sequence Builder ──────────────────────────────────────

class _SequenceBuilder extends StatefulWidget {
  final Map<String, dynamic>? existing;
  final Future<void> Function(Map<String, dynamic>) onSave;

  const _SequenceBuilder({this.existing, required this.onSave});

  @override
  State<_SequenceBuilder> createState() => _SequenceBuilderState();
}

class _SequenceBuilderState extends State<_SequenceBuilder> {
  final _nameController = TextEditingController();
  String _triggerStatus = 'contacted';
  bool _isActive = true;
  bool _saving = false;

  final List<Map<String, dynamic>> _steps = [];

  static const _statuses = [
    'new', 'contacted', 'requirement_gathered', 'proposal_sent',
    'negotiation', 'booking_confirmed',
  ];
  static const _types = ['call', 'email', 'whatsapp', 'visit', 'sms'];

  @override
  void initState() {
    super.initState();
    if (widget.existing != null) {
      _nameController.text = widget.existing!['name'] as String? ?? '';
      _triggerStatus =
          widget.existing!['triggerStatus'] as String? ?? 'contacted';
      _isActive =
          widget.existing!['isActive'] == 1 || widget.existing!['isActive'] == true;
      final steps = widget.existing!['steps'];
      if (steps is List) {
        _steps.addAll(steps.cast<Map<String, dynamic>>());
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _addStep() {
    setState(() => _steps.add({'day': _steps.length, 'type': 'call', 'notes': ''}));
  }

  Future<void> _save() async {
    if (_nameController.text.isEmpty) {
      AppSnackbar.error(context, 'Please enter a sequence name');
      return;
    }
    if (_steps.isEmpty) {
      AppSnackbar.error(context, 'Please add at least one step');
      return;
    }
    setState(() => _saving = true);
    await widget.onSave({
      'name': _nameController.text.trim(),
      'triggerStatus': _triggerStatus,
      'steps': _steps,
      'isActive': _isActive,
    });
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (_, controller) => Column(
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
            child: Row(
              children: [
                Text(
                  widget.existing != null
                      ? 'Edit Sequence'
                      : 'New Sequence',
                  style: theme.textTheme.titleLarge,
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.all(16.0),
              children: [
                AppSectionCard(
                  title: 'Sequence Settings',
                  child: Column(
                    children: [
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: 'Sequence Name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: AppTheme.spacingMd),
                      DropdownButtonFormField<String>(
                        initialValue: _triggerStatus,
                        decoration: const InputDecoration(
                          labelText: 'Trigger on Status',
                          border: OutlineInputBorder(),
                        ),
                        items: _statuses
                            .map((s) =>
                                DropdownMenuItem(value: s, child: Text(s)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _triggerStatus = v ?? _triggerStatus),
                      ),
                      const SizedBox(height: AppTheme.spacingMd),
                      SwitchListTile(
                        title: const Text('Active'),
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                AppSectionCard(
                  title: 'Steps (${_steps.length})',
                  child: Column(
                    children: [
                      for (var i = 0; i < _steps.length; i++)
                        _StepRow(
                          index: i,
                          step: _steps[i],
                          types: _types,
                          onChanged: (updated) => setState(
                              () => _steps[i] = updated),
                          onDelete: () =>
                              setState(() => _steps.removeAt(i)),
                        ),
                      const SizedBox(height: AppTheme.spacingSm),
                      OutlinedButton.icon(
                        onPressed: _addStep,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add Step'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  final int index;
  final Map<String, dynamic> step;
  final List<String> types;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final VoidCallback onDelete;

  const _StepRow({
    required this.index,
    required this.step,
    required this.types,
    required this.onChanged,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingSm),
        child: Row(
          children: [
            CircleAvatar(radius: 14, child: Text('${index + 1}')),
            const SizedBox(width: AppTheme.spacingSm),
            SizedBox(
              width: 60,
              child: TextFormField(
                initialValue: '${step['day'] ?? index}',
                decoration: const InputDecoration(
                  labelText: 'Day',
                  border: OutlineInputBorder(),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                ),
                keyboardType: TextInputType.number,
                onChanged: (v) =>
                    onChanged({...step, 'day': int.tryParse(v) ?? index}),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: step['type'] as String? ?? 'call',
                decoration: const InputDecoration(
                  labelText: 'Type',
                  border: OutlineInputBorder(),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                ),
                items: types
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => onChanged({...step, 'type': v ?? 'call'}),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
