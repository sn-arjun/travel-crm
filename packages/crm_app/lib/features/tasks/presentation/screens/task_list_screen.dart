import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/task.dart';
import '../providers/task_provider.dart';

/// Task list screen with My Tasks and All Tasks tabs.
class TaskListScreen extends ConsumerWidget {
  const TaskListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(taskViewProvider);
    final statusFilter = ref.watch(taskFilterStatusProvider);
    final priorityFilter = ref.watch(taskFilterPriorityProvider);

    // Build filter key
    final key = '${statusFilter ?? ''}|${priorityFilter ?? ''}||$view|1';
    final tasksAsync = ref.watch(taskListProvider(key));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Tasks'),
          bottom: TabBar(
            onTap: (index) {
              ref.read(taskViewProvider.notifier).state = index == 0 ? 'my' : 'all';
            },
            tabs: const [
              Tab(text: 'My Tasks'),
              Tab(text: 'All Tasks'),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.filter_list),
              onPressed: () => _showFilters(context, ref),
            ),
          ],
        ),
        body: Column(
          children: [
            // Active filter chips
            if (statusFilter != null || priorityFilter != null)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Wrap(
                  spacing: 8,
                  children: [
                    if (statusFilter != null)
                      Chip(
                        label: Text(statusFilter),
                        onDeleted: () => ref.read(taskFilterStatusProvider.notifier).state = null,
                      ),
                    if (priorityFilter != null)
                      Chip(
                        label: Text(priorityFilter),
                        onDeleted: () => ref.read(taskFilterPriorityProvider.notifier).state = null,
                      ),
                  ],
                ),
              ),
            Expanded(
              child: tasksAsync.when(
                data: (tasks) {
                  if (tasks.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.task_alt, size: 64, color: Colors.grey.shade400),
                          const SizedBox(height: 12),
                          Text('No tasks yet', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          FilledButton.icon(
                            onPressed: () => context.push('/tasks/create'),
                            icon: const Icon(Icons.add),
                            label: const Text('Create your first task'),
                          ),
                        ],
                      ),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async => ref.invalidate(taskListProvider(key)),
                    child: ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: tasks.length,
                      itemBuilder: (context, index) => _TaskCard(task: tasks[index]),
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('Error: $e')),
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => context.push('/tasks/create'),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }

  void _showFilters(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Status', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: ['todo', 'in_progress', 'done'].map((s) {
                return FilterChip(
                  label: Text(s == 'todo' ? 'To Do' : s == 'in_progress' ? 'In Progress' : 'Done'),
                  selected: ref.read(taskFilterStatusProvider) == s,
                  onSelected: (v) {
                    ref.read(taskFilterStatusProvider.notifier).state = v ? s : null;
                    Navigator.pop(ctx);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            Text('Priority', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: TaskPriority.values.map((p) {
                return FilterChip(
                  label: Text(p.displayName),
                  avatar: CircleAvatar(backgroundColor: p.color, radius: 6),
                  selected: ref.read(taskFilterPriorityProvider) == p.name,
                  onSelected: (v) {
                    ref.read(taskFilterPriorityProvider.notifier).state = v ? p.name : null;
                    Navigator.pop(ctx);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  final Task task;
  const _TaskCard({required this.task});

  @override
  Widget build(BuildContext context) {
    final isOverdue = task.dueDate != null &&
        DateTime.tryParse(task.dueDate!)?.isBefore(DateTime.now()) == true &&
        task.status != TaskStatus.done;

    return Card(
      color: isOverdue ? Colors.red.shade50 : null,
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => context.push('/tasks/${task.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Row(
          children: [
            // Priority color bar
            Container(
              width: 4,
              height: 80,
              decoration: BoxDecoration(
                color: task.priority.color,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  bottomLeft: Radius.circular(12),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            task.title,
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              decoration: task.status == TaskStatus.done ? TextDecoration.lineThrough : null,
                            ),
                          ),
                        ),
                        if (isOverdue)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.red,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('OVERDUE', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        // Category chip
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(task.category.icon, size: 12, color: Colors.grey.shade700),
                              const SizedBox(width: 4),
                              Text(task.category.displayName, style: TextStyle(fontSize: 11, color: Colors.grey.shade700)),
                            ],
                          ),
                        ),
                        const Spacer(),
                        // Due date
                        if (task.dueDate != null)
                          Text(
                            _formatDueDate(task.dueDate!),
                            style: TextStyle(
                              fontSize: 12,
                              color: isOverdue ? Colors.red : Colors.grey.shade600,
                            ),
                          ),
                        // Subtask progress
                        if (task.subtaskCount > 0) ...[
                          const SizedBox(width: 8),
                          Text(
                            '${task.completedSubtaskCount}/${task.subtaskCount}',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
            // Status icon
            Padding(
              padding: const EdgeInsets.all(12),
              child: Icon(task.status.icon, size: 20, color: task.status.color),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDueDate(String dateStr) {
    final date = DateTime.tryParse(dateStr);
    if (date == null) return dateStr;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDay = DateTime(date.year, date.month, date.day);
    final diff = dueDay.difference(today).inDays;

    if (diff == 0) return 'Due today';
    if (diff == 1) return 'Due tomorrow';
    if (diff == -1) return 'Due yesterday';
    if (diff < -1) return 'Overdue by ${-diff} days';
    if (diff < 7) return 'Due in $diff days';
    return DateFormat('MMM d').format(date);
  }
}
