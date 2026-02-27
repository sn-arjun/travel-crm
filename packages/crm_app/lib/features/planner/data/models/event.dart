import 'package:flutter/material.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'event.freezed.dart';
part 'event.g.dart';

/// Calendar event types with their display names, colors, and icons.
enum EventType {
  @JsonValue('trip_departure')
  tripDeparture,
  @JsonValue('trip_return')
  tripReturn,
  @JsonValue('meeting')
  meeting,
  @JsonValue('follow_up')
  followUp,
  @JsonValue('deadline')
  deadline,
  @JsonValue('reminder')
  reminder,
  @JsonValue('holiday')
  holiday;

  String get displayName => switch (this) {
    tripDeparture => 'Trip Departure',
    tripReturn => 'Trip Return',
    meeting => 'Meeting',
    followUp => 'Follow-up',
    deadline => 'Deadline',
    reminder => 'Reminder',
    holiday => 'Holiday',
  };

  Color get color => switch (this) {
    tripDeparture => const Color(0xFF2196F3),
    tripReturn => const Color(0xFF2196F3),
    meeting => const Color(0xFF9C27B0),
    followUp => const Color(0xFFFF9800),
    deadline => const Color(0xFFF44336),
    reminder => const Color(0xFFFFC107),
    holiday => const Color(0xFF4CAF50),
  };

  IconData get icon => switch (this) {
    tripDeparture => Icons.flight_takeoff,
    tripReturn => Icons.flight_land,
    meeting => Icons.people,
    followUp => Icons.phone_callback,
    deadline => Icons.flag,
    reminder => Icons.notifications_active,
    holiday => Icons.beach_access,
  };
}

@freezed
abstract class Event with _$Event {
  const factory Event({
    required String id,
    required String title,
    String? description,
    @JsonKey(name: 'event_type') required EventType eventType,
    @JsonKey(name: 'start_at') required String startAt,
    @JsonKey(name: 'end_at') String? endAt,
    @JsonKey(name: 'all_day') @Default(false) bool allDay,
    String? location,
    String? color,
    @JsonKey(name: 'recurrence_rule') Map<String, dynamic>? recurrenceRule,
    @JsonKey(name: 'recurrence_parent_id') String? recurrenceParentId,
    @JsonKey(name: 'related_lead_id') String? relatedLeadId,
    @JsonKey(name: 'related_task_id') String? relatedTaskId,
    @JsonKey(name: 'assigned_to') required String assignedTo,
    @JsonKey(name: 'created_by') required String createdBy,
    @JsonKey(name: 'assignee_name') String? assigneeName,
    @JsonKey(name: 'creator_name') String? creatorName,
    @Default('Asia/Kolkata') String timezone,
    @JsonKey(name: 'is_recurring') @Default(false) bool isRecurring,
    @JsonKey(name: 'is_deleted') @Default(false) bool isDeleted,
    @JsonKey(name: 'created_at') String? createdAt,
    @JsonKey(name: 'updated_at') String? updatedAt,
  }) = _Event;

  factory Event.fromJson(Map<String, dynamic> json) => _$EventFromJson(json);
}

@freezed
abstract class RecurrenceRule with _$RecurrenceRule {
  const factory RecurrenceRule({
    required String frequency, // daily, weekly, monthly
    @Default(1) int interval,
    @JsonKey(name: 'end_date') String? endDate,
    @JsonKey(name: 'days_of_week') List<int>? daysOfWeek,
  }) = _RecurrenceRule;

  factory RecurrenceRule.fromJson(Map<String, dynamic> json) =>
      _$RecurrenceRuleFromJson(json);
}
