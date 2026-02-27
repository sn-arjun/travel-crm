import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/dio_provider.dart';
import '../../data/models/task.dart';
import '../../data/models/task_comment.dart';
import '../../data/repositories/task_repository.dart';

/// Provider for TaskRepository singleton.
final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return TaskRepository(dio);
});

/// Task list provider with filters.
/// Key: 'status|priority|category|view|page'
final taskListProvider = FutureProvider.family<List<Task>, String>((ref, key) async {
  final parts = key.split('|');
  final repo = ref.watch(taskRepositoryProvider);
  return repo.getTasks(
    status: parts[0].isNotEmpty ? parts[0] : null,
    priority: parts[1].isNotEmpty ? parts[1] : null,
    category: parts[2].isNotEmpty ? parts[2] : null,
    view: parts.length > 3 ? parts[3] : 'my',
    page: parts.length > 4 ? int.tryParse(parts[4]) ?? 1 : 1,
  );
});

/// Task detail provider.
final taskDetailProvider = FutureProvider.family<Task, String>((ref, id) async {
  final repo = ref.watch(taskRepositoryProvider);
  return repo.getTask(id);
});

/// Subtasks provider.
final subtasksProvider = FutureProvider.family<List<Task>, String>((ref, taskId) async {
  final repo = ref.watch(taskRepositoryProvider);
  return repo.getSubtasks(taskId);
});

/// Task comments provider.
final taskCommentsProvider = FutureProvider.family<List<TaskComment>, String>((ref, taskId) async {
  final repo = ref.watch(taskRepositoryProvider);
  return repo.getComments(taskId);
});

/// Current task filter state.
final taskFilterStatusProvider = StateProvider<String?>((ref) => null);
final taskFilterPriorityProvider = StateProvider<String?>((ref) => null);
final taskFilterCategoryProvider = StateProvider<String?>((ref) => null);
final taskViewProvider = StateProvider<String>((ref) => 'my');
