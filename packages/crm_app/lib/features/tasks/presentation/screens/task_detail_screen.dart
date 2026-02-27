import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/task.dart';
import '../../data/models/task_comment.dart';
import '../providers/task_provider.dart';

/// Task detail screen with subtasks and comments.
class TaskDetailScreen extends ConsumerWidget {
  final String taskId;

  const TaskDetailScreen({super.key, required this.taskId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final taskAsync = ref.watch(taskDetailProvider(taskId));
    final subtasksAsync = ref.watch(subtasksProvider(taskId));
    final commentsAsync = ref.watch(taskCommentsProvider(taskId));

    return taskAsync.when(
      data: (task) => Scaffold(
        appBar: AppBar(
          title: const Text('Task Details'),
          actions: [
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => context.push('/tasks/$taskId/edit'),
            ),
            PopupMenuButton<String>(
              onSelected: (v) => _handleAction(context, ref, v, task),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.red))),
              ],
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildHeader(context, ref, task),
            const Divider(height: 32),
            _buildInfoSection(task),
            const Divider(height: 32),
            _buildSubtasksSection(context, ref, subtasksAsync),
            const Divider(height: 32),
            _buildCommentsSection(context, ref, commentsAsync),
          ],
        ),
        bottomNavigationBar: _CommentInput(taskId: taskId),
      ),
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
    );
  }

  Widget _buildHeader(BuildContext context, WidgetRef ref, Task task) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(task.title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            // Status chip (tappable)
            ActionChip(
              avatar: Icon(task.status.icon, size: 16, color: task.status.color),
              label: Text(task.status.displayName),
              backgroundColor: task.status.color.withValues(alpha: 0.15),
              onPressed: () => _showStatusPicker(context, ref, task),
            ),
            // Priority chip
            Chip(
              label: Text(task.priority.displayName),
              backgroundColor: task.priority.color.withValues(alpha: 0.15),
              labelStyle: TextStyle(color: task.priority.color),
            ),
            // Category chip
            Chip(
              avatar: Icon(task.category.icon, size: 16),
              label: Text(task.category.displayName),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildInfoSection(Task task) {
    final isOverdue = task.dueDate != null &&
        DateTime.tryParse(task.dueDate!)?.isBefore(DateTime.now()) == true &&
        task.status != TaskStatus.done;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (task.description != null && task.description!.isNotEmpty) ...[
          Text(task.description!, style: const TextStyle(height: 1.5)),
          const SizedBox(height: 12),
        ],
        if (task.dueDate != null) _infoRow(
          Icons.calendar_today,
          'Due: ${DateFormat('MMM d, yyyy').format(DateTime.parse(task.dueDate!))}',
          color: isOverdue ? Colors.red : null,
        ),
        if (task.assigneeName != null)
          _infoRow(Icons.person, 'Assigned to: ${task.assigneeName}'),
        if (task.leadTitle != null)
          _infoRow(Icons.business, 'Linked to: ${task.leadTitle}'),
        if (task.completedAt != null)
          _infoRow(Icons.check_circle, 'Completed: ${DateFormat('MMM d, yyyy').format(DateTime.parse(task.completedAt!))}',
              color: Colors.green),
      ],
    );
  }

  Widget _buildSubtasksSection(BuildContext context, WidgetRef ref, AsyncValue<List<Task>> subtasksAsync) {
    return subtasksAsync.when(
      data: (subtasks) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Subtasks', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              TextButton.icon(
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add'),
                onPressed: () => context.push('/tasks/create?parent_task_id=$taskId'),
              ),
            ],
          ),
          if (subtasks.isNotEmpty) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: subtasks.isEmpty ? 0 : subtasks.where((s) => s.status == TaskStatus.done).length / subtasks.length,
                minHeight: 6,
              ),
            ),
            Text(
              '${subtasks.where((s) => s.status == TaskStatus.done).length} of ${subtasks.length} complete',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
          const SizedBox(height: 8),
          ...subtasks.map((s) => CheckboxListTile(
            value: s.status == TaskStatus.done,
            title: Text(
              s.title,
              style: s.status == TaskStatus.done ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
            ),
            subtitle: s.assigneeName != null ? Text(s.assigneeName!) : null,
            onChanged: (v) async {
              try {
                await ref.read(taskRepositoryProvider).updateStatus(
                  s.id,
                  v == true ? 'done' : 'todo',
                );
                ref.invalidate(subtasksProvider(taskId));
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                }
              }
            },
          )),
          if (subtasks.isEmpty)
            Text('No subtasks yet', style: TextStyle(color: Colors.grey.shade600)),
        ],
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('Error loading subtasks: $e'),
    );
  }

  Widget _buildCommentsSection(BuildContext context, WidgetRef ref, AsyncValue<List<TaskComment>> commentsAsync) {
    return commentsAsync.when(
      data: (comments) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Comments (${comments.length})', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (comments.isEmpty)
            Text('No comments yet', style: TextStyle(color: Colors.grey.shade600))
          else
            ...comments.map((c) => _CommentTile(comment: c, taskId: taskId)),
        ],
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('Error loading comments: $e'),
    );
  }

  Widget _infoRow(IconData icon, String text, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color ?? Colors.grey.shade600),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: color))),
        ],
      ),
    );
  }

  void _showStatusPicker(BuildContext context, WidgetRef ref, Task task) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: task.status.validTransitions.map((s) {
            return ListTile(
              leading: Icon(s.icon, color: s.color),
              title: Text(s.displayName),
              onTap: () async {
                Navigator.pop(ctx);
                try {
                  await ref.read(taskRepositoryProvider).updateStatus(taskId, s.name == 'inProgress' ? 'in_progress' : s.name);
                  ref.invalidate(taskDetailProvider(taskId));
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                  }
                }
              },
            );
          }).toList(),
        ),
      ),
    );
  }

  void _handleAction(BuildContext context, WidgetRef ref, String action, Task task) {
    if (action == 'delete') {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Delete Task'),
          content: const Text('Are you sure? This will also delete subtasks.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  await ref.read(taskRepositoryProvider).deleteTask(taskId);
                  if (context.mounted) context.pop();
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                  }
                }
              },
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
    }
  }
}

class _CommentTile extends StatelessWidget {
  final TaskComment comment;
  final String taskId;

  const _CommentTile({required this.comment, required this.taskId});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            child: Text(comment.userName?.substring(0, 1).toUpperCase() ?? '?'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(comment.userName ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(width: 8),
                    if (comment.createdAt != null)
                      Text(
                        _timeAgo(comment.createdAt!),
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(comment.content),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _timeAgo(String dateStr) {
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d').format(date);
  }
}

class _CommentInput extends ConsumerStatefulWidget {
  final String taskId;
  const _CommentInput({required this.taskId});

  @override
  ConsumerState<_CommentInput> createState() => _CommentInputState();
}

class _CommentInputState extends ConsumerState<_CommentInput> {
  final _ctrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                decoration: const InputDecoration(
                  hintText: 'Add a comment...',
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: _sending
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              onPressed: _sending ? null : _send,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _send() async {
    if (_ctrl.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(taskRepositoryProvider).addComment(widget.taskId, _ctrl.text.trim());
      _ctrl.clear();
      ref.invalidate(taskCommentsProvider(widget.taskId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
    if (mounted) setState(() => _sending = false);
  }
}
