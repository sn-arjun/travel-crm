import 'package:dio/dio.dart';
import '../models/event.dart';

/// Repository for calendar events API communication.
class EventRepository {
  final Dio _dio;

  EventRepository(this._dio);

  /// Fetches events within a date range.
  Future<List<Event>> getEvents({
    required DateTime startDate,
    required DateTime endDate,
    String? eventType,
    String? assignedTo,
    String view = 'my',
  }) async {
    final response = await _dio.get('/api/v1/events', queryParameters: {
      'start_date': startDate.toIso8601String(),
      'end_date': endDate.toIso8601String(),
      'event_type': ?eventType,
      'assigned_to': ?assignedTo,
      'view': view,
    });
    final data = response.data['data'] as List? ?? [];
    return data.map((e) => Event.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Fetches a single event by ID.
  Future<Event> getEvent(String id) async {
    final response = await _dio.get('/api/v1/events/$id');
    return Event.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Creates a new event.
  Future<Event> createEvent(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/v1/events', data: body);
    return Event.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Updates an existing event.
  Future<Event> updateEvent(String id, Map<String, dynamic> body) async {
    final response = await _dio.put('/api/v1/events/$id', data: body);
    return Event.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// Deletes an event (soft delete).
  Future<void> deleteEvent(String id, {String scope = 'this'}) async {
    await _dio.delete('/api/v1/events/$id', data: {'delete_scope': scope});
  }

  /// Reschedules an event (for drag-drop).
  Future<void> rescheduleEvent(String id, DateTime startAt, {DateTime? endAt}) async {
    await _dio.patch('/api/v1/events/$id/reschedule', data: {
      'start_at': startAt.toIso8601String(),
      if (endAt != null) 'end_at': endAt.toIso8601String(),
    });
  }
}
