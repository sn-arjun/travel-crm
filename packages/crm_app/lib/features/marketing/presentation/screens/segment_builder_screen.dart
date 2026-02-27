import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/providers/marketing_providers.dart';

class SegmentBuilderScreen extends ConsumerStatefulWidget {
  final String? segmentId;

  const SegmentBuilderScreen({super.key, this.segmentId});

  @override
  ConsumerState<SegmentBuilderScreen> createState() =>
      _SegmentBuilderScreenState();
}

class _SegmentBuilderScreenState extends ConsumerState<SegmentBuilderScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  String _logic = 'AND';
  final List<Map<String, dynamic>> _rules = [];
  bool _isLoading = false;

  static const _fields = [
    'city',
    'state',
    'country',
    'tags',
    'type',
    'birthday_month',
    'lead_source',
    'has_email',
    'has_phone',
  ];

  static const _operators = [
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'is_empty',
    'is_not_empty',
    'gt',
    'lt',
    'between',
    'in',
  ];

  @override
  void initState() {
    super.initState();
    if (widget.segmentId != null) {
      _loadSegment();
    }
  }

  Future<void> _loadSegment() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(segmentRepositoryProvider);
      final segment = await repo.getSegment(widget.segmentId!);
      _nameController.text = segment.name;
      _descController.text = segment.description ?? '';

      if (segment.filtersJson != null) {
        final filters = jsonDecode(segment.filtersJson!);
        _logic = filters['logic'] ?? 'AND';
        final rules = filters['rules'] as List? ?? [];
        for (final rule in rules) {
          _rules.add(Map<String, dynamic>.from(rule));
        }
      }
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  void _addRule() {
    setState(() {
      _rules.add({'field': 'city', 'operator': 'equals', 'value': ''});
    });
  }

  void _removeRule(int index) {
    setState(() => _rules.removeAt(index));
  }

  Future<void> _save() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Name is required')));
      return;
    }

    setState(() => _isLoading = true);
    try {
      final repo = ref.read(segmentRepositoryProvider);
      final filtersJson = jsonEncode({'logic': _logic, 'rules': _rules});
      final data = {
        'name': _nameController.text,
        'description': _descController.text,
        'filtersJson': filtersJson,
        'isDynamic': true,
      };

      if (widget.segmentId != null) {
        await repo.updateSegment(widget.segmentId!, data);
      } else {
        await repo.createSegment(data);
      }

      ref.read(segmentListProvider.notifier).loadSegments(refresh: true);
      if (!mounted) return;
      context.go('/marketing/segments');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        widget.segmentId != null
                            ? 'Edit Segment'
                            : 'New Segment',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      Row(
                        children: [
                          OutlinedButton(
                            onPressed: () => context.go('/marketing/segments'),
                            child: const Text('Cancel'),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: _save,
                            child: const Text('Save Segment'),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Name & Description
                  TextField(
                    controller: _nameController,
                    decoration: const InputDecoration(
                      labelText: 'Segment Name *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _descController,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 24),

                  // Logic Toggle
                  Row(
                    children: [
                      Text(
                        'Match contacts where',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(width: 12),
                      SegmentedButton<String>(
                        selected: {_logic},
                        onSelectionChanged: (values) =>
                            setState(() => _logic = values.first),
                        segments: const [
                          ButtonSegment(value: 'AND', label: Text('ALL')),
                          ButtonSegment(value: 'OR', label: Text('ANY')),
                        ],
                      ),
                      const SizedBox(width: 8),
                      const Text('of these rules match:'),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Rules
                  ..._rules.asMap().entries.map((entry) {
                    final i = entry.key;
                    final rule = entry.value;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: DropdownButtonFormField<String>(
                                initialValue: rule['field'],
                                decoration: const InputDecoration(
                                  labelText: 'Field',
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                                items: _fields
                                    .map(
                                      (f) => DropdownMenuItem(
                                        value: f,
                                        child: Text(f),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (v) =>
                                    setState(() => _rules[i]['field'] = v),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 2,
                              child: DropdownButtonFormField<String>(
                                initialValue: rule['operator'],
                                decoration: const InputDecoration(
                                  labelText: 'Operator',
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                                items: _operators
                                    .map(
                                      (o) => DropdownMenuItem(
                                        value: o,
                                        child: Text(o),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (v) =>
                                    setState(() => _rules[i]['operator'] = v),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 3,
                              child: TextField(
                                decoration: const InputDecoration(
                                  labelText: 'Value',
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                                controller: TextEditingController(
                                  text: rule['value']?.toString() ?? '',
                                ),
                                onChanged: (v) => _rules[i]['value'] = v,
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.red),
                              onPressed: () => _removeRule(i),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),

                  // Add Rule Button
                  OutlinedButton.icon(
                    onPressed: _addRule,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Rule'),
                  ),
                ],
              ),
            ),
    );
  }
}
