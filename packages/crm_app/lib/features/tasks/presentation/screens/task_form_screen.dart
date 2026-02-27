import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/task.dart';
import '../providers/task_provider.dart';

/// Task creation and editing form.
class TaskFormScreen extends ConsumerStatefulWidget {
  final String? taskId;
  final String? relatedLeadId;

  const TaskFormScreen({super.key, this.taskId, this.relatedLeadId});

  @override
  ConsumerState<TaskFormScreen> createState() => _TaskFormScreenState();
}

class _TaskFormScreenState extends ConsumerState<TaskFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _titleCtrl;
  late TextEditingController _descriptionCtrl;

  DateTime? _dueDate;
  TaskPriority _priority = TaskPriority.medium;
  TaskCategory _category = TaskCategory.general;
  bool _isLoading = false;
  bool get _isEditing => widget.taskId != null;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController();
    _descriptionCtrl = TextEditingController();
    if (_isEditing) _loadTask();
  }

  Future<void> _loadTask() async {
    setState(() => _isLoading = true);
    try {
      final task = await ref.read(taskRepositoryProvider).getTask(widget.taskId!);
      _titleCtrl.text = task.title;
      _descriptionCtrl.text = task.description ?? '';
      _dueDate = task.dueDate != null ? DateTime.tryParse(task.dueDate!) : null;
      _priority = task.priority;
      _category = task.category;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Task' : 'New Task')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Title
                  TextFormField(
                    controller: _titleCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Title *',
                      prefixIcon: Icon(Icons.task_alt),
                    ),
                    validator: (v) => v?.isEmpty == true ? 'Title is required' : null,
                  ),
                  const SizedBox(height: 16),

                  // Description
                  TextFormField(
                    controller: _descriptionCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      prefixIcon: Icon(Icons.description),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),

                  // Due date
                  InkWell(
                    onTap: _pickDueDate,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Due Date',
                        prefixIcon: Icon(Icons.calendar_today),
                      ),
                      child: Row(
                        children: [
                          Text(_dueDate != null
                              ? DateFormat('MMM d, yyyy').format(_dueDate!)
                              : 'Select due date'),
                          const Spacer(),
                          if (_dueDate != null)
                            IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () => setState(() => _dueDate = null),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Priority chips
                  Text('Priority', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: TaskPriority.values.map((p) {
                      final selected = _priority == p;
                      return ChoiceChip(
                        label: Text(p.displayName),
                        selected: selected,
                        selectedColor: p.color.withValues(alpha: 0.3),
                        labelStyle: TextStyle(
                          color: selected ? p.color : null,
                          fontWeight: selected ? FontWeight.w600 : null,
                        ),
                        onSelected: (_) => setState(() => _priority = p),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),

                  // Category dropdown
                  Text('Category', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<TaskCategory>(
                    initialValue: _category,
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.category)),
                    items: TaskCategory.values.map((c) {
                      return DropdownMenuItem(
                        value: c,
                        child: Row(
                          children: [
                            Icon(c.icon, size: 18),
                            const SizedBox(width: 8),
                            Text(c.displayName),
                          ],
                        ),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _category = v ?? TaskCategory.general),
                  ),
                ],
              ),
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _isLoading ? null : _save,
            child: _isLoading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(_isEditing ? 'Update Task' : 'Create Task'),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDueDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime(2030),
    );
    if (date != null) setState(() => _dueDate = date);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    try {
      final body = <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'description': _descriptionCtrl.text.trim().isEmpty ? null : _descriptionCtrl.text.trim(),
        'due_date': _dueDate?.toIso8601String().split('T')[0],
        'priority': _priority.name,
        'category': _category == TaskCategory.followUp ? 'follow_up'
            : _category == TaskCategory.voucherCreation ? 'voucher_creation'
            : _category == TaskCategory.paymentCollection ? 'payment_collection'
            : _category == TaskCategory.documentCollection ? 'document_collection'
            : _category == TaskCategory.visaProcessing ? 'visa_processing'
            : 'general',
        if (widget.relatedLeadId != null) 'related_lead_id': widget.relatedLeadId,
      };

      final repo = ref.read(taskRepositoryProvider);
      if (_isEditing) {
        await repo.updateTask(widget.taskId!, body);
      } else {
        await repo.createTask(body);
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isEditing ? 'Task updated' : 'Task created')),
      );
      context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
    if (mounted) setState(() => _isLoading = false);
  }
}
