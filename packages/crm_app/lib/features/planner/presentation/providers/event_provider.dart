import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/dio_provider.dart';
import '../../data/models/event.dart';
import '../../data/repositories/event_repository.dart';

/// Provider for EventRepository singleton.
final eventRepositoryProvider = Provider<EventRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return EventRepository(dio);
});

/// Provider for events in a date range.
/// Key: 'startDate|endDate|view'
final eventsProvider = FutureProvider.family<List<Event>, String>((ref, key) async {
  final parts = key.split('|');
  final repo = ref.watch(eventRepositoryProvider);
  return repo.getEvents(
    startDate: DateTime.parse(parts[0]),
    endDate: DateTime.parse(parts[1]),
    view: parts.length > 2 ? parts[2] : 'my',
  );
});

/// Provider for a single event detail.
final eventDetailProvider = FutureProvider.family<Event, String>((ref, id) async {
  final repo = ref.watch(eventRepositoryProvider);
  return repo.getEvent(id);
});

/// Provider for the currently selected date on the calendar.
final selectedDateProvider = StateProvider<DateTime>((ref) => DateTime.now());

/// Provider for calendar view mode (month, week, day).
final calendarViewModeProvider = StateProvider<CalendarViewMode>((ref) => CalendarViewMode.month);

/// Provider for team/my calendar toggle.
final calendarViewTypeProvider = StateProvider<String>((ref) => 'my');

enum CalendarViewMode { month, week, day }
