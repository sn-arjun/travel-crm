import 'package:dio/dio.dart';
import '../models/task.dart';
import '../models/task_comment.dart';

/// Repository for tasks API communication.
class TaskRepository {
  final Dio _dio;

  TaskRepository(this._dio);

  /// List tasks with filters.
  Future<List<Task>> getTasks({
    String? status,
    String? priority,
    String? category,
    bool? overdue,
    String view = 'my',
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get('/api/v1/tasks', queryParameters: {
      'status': ?status,
      'priority': ?priority,
      'category': ?category,
      if (overdue == true) 'overdue': 'true',
      'view': view,
      'page': page,
      'limit': limit,
    });
    final data = response.data['data'] as List? ?? [];
    return data.map((e) => Task.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Get single task.
  Future<Task> getTask(String id) async {
    final response = await _dio.get('/api/v1/tasks/$id');
    return Task.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Create task.
  Future<Task> createTask(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/v1/tasks', data: body);
    return Task.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Update task.
  Future<Task> updateTask(String id, Map<String, dynamic> body) async {
    final response = await _dio.put('/api/v1/tasks/$id', data: body);
    return Task.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Update task status.
  Future<void> updateStatus(String id, String status) async {
    await _dio.patch('/api/v1/tasks/$id/status', data: {'status': status});
  }

  /// Delete task.
  Future<void> deleteTask(String id) async {
    await _dio.delete('/api/v1/tasks/$id');
  }

  /// Get subtasks.
  Future<List<Task>> getSubtasks(String taskId) async {
    final response = await _dio.get('/api/v1/tasks/$taskId/subtasks');
    final data = response.data['data'] as List? ?? [];
    return data.map((e) => Task.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Get tasks linked to a lead.
  Future<List<Task>> getLeadTasks(String leadId) async {
    final response = await _dio.get('/api/v1/tasks/leads/$leadId/tasks');
    final data = response.data['data'] as List? ?? [];
    return data.map((e) => Task.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Get task comments.
  Future<List<TaskComment>> getComments(String taskId) async {
    final response = await _dio.get('/api/v1/tasks/$taskId/comments');
    final data = response.data['data'] as List? ?? [];
    return data.map((e) => TaskComment.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Add comment.
  Future<TaskComment> addComment(String taskId, String content) async {
    final response = await _dio.post('/api/v1/tasks/$taskId/comments', data: {'content': content});
    return TaskComment.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Delete comment.
  Future<void> deleteComment(String taskId, String commentId) async {
    await _dio.delete('/api/v1/tasks/$taskId/comments/$commentId');
  }
}
