import 'package:flutter/material.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'task.freezed.dart';
part 'task.g.dart';

/// Task status with display names.
enum TaskStatus {
  @JsonValue('todo')
  todo,
  @JsonValue('in_progress')
  inProgress,
  @JsonValue('done')
  done;

  String get displayName => switch (this) {
    todo => 'To Do',
    inProgress => 'In Progress',
    done => 'Done',
  };

  Color get color => switch (this) {
    todo => const Color(0xFF9E9E9E),
    inProgress => const Color(0xFF2196F3),
    done => const Color(0xFF4CAF50),
  };

  IconData get icon => switch (this) {
    todo => Icons.radio_button_unchecked,
    inProgress => Icons.timelapse,
    done => Icons.check_circle,
  };

  /// Valid next statuses for transition validation.
  List<TaskStatus> get validTransitions => switch (this) {
    todo => [inProgress],
    inProgress => [done],
    done => [inProgress], // re-open
  };
}

/// Task priority with colors.
enum TaskPriority {
  @JsonValue('high')
  high,
  @JsonValue('medium')
  medium,
  @JsonValue('low')
  low;

  String get displayName => switch (this) {
    high => 'High',
    medium => 'Medium',
    low => 'Low',
  };

  Color get color => switch (this) {
    high => const Color(0xFFF44336),
    medium => const Color(0xFFFF9800),
    low => const Color(0xFF4CAF50),
  };
}

/// Task category with icons.
enum TaskCategory {
  @JsonValue('follow_up')
  followUp,
  @JsonValue('voucher_creation')
  voucherCreation,
  @JsonValue('payment_collection')
  paymentCollection,
  @JsonValue('document_collection')
  documentCollection,
  @JsonValue('visa_processing')
  visaProcessing,
  @JsonValue('general')
  general;

  String get displayName => switch (this) {
    followUp => 'Follow-up',
    voucherCreation => 'Voucher Creation',
    paymentCollection => 'Payment Collection',
    documentCollection => 'Document Collection',
    visaProcessing => 'Visa Processing',
    general => 'General',
  };

  IconData get icon => switch (this) {
    followUp => Icons.phone_callback,
    voucherCreation => Icons.receipt_long,
    paymentCollection => Icons.currency_rupee,
    documentCollection => Icons.folder_outlined,
    visaProcessing => Icons.card_travel,
    general => Icons.task_alt,
  };
}

@freezed
abstract class Task with _$Task {
  const factory Task({
    required String id,
    required String title,
    String? description,
    @Default(TaskStatus.todo) TaskStatus status,
    @Default(TaskPriority.medium) TaskPriority priority,
    @Default(TaskCategory.general) TaskCategory category,
    @JsonKey(name: 'due_date') String? dueDate,
    @JsonKey(name: 'assigned_to') required String assignedTo,
    @JsonKey(name: 'related_lead_id') String? relatedLeadId,
    @JsonKey(name: 'parent_task_id') String? parentTaskId,
    @JsonKey(name: 'created_by') required String createdBy,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'assignee_name') String? assigneeName,
    @JsonKey(name: 'lead_title') String? leadTitle,
    @JsonKey(name: 'subtask_count') @Default(0) int subtaskCount,
    @JsonKey(name: 'completed_subtask_count') @Default(0) int completedSubtaskCount,
    @JsonKey(name: 'is_deleted') @Default(false) bool isDeleted,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}
