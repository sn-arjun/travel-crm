import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../../app/theme.dart';
import '../../data/models/event.dart';
import '../providers/event_provider.dart';

/// Main calendar screen with month/week/day views.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _focusedDay;
  DateTime? _selectedDay;
  CalendarFormat _calendarFormat = CalendarFormat.month;

  @override
  void initState() {
    super.initState();
    _focusedDay = DateTime.now();
    _selectedDay = DateTime.now();
  }

  String _buildEventsKey() {
    final start = DateTime(_focusedDay.year, _focusedDay.month - 1, 1);
    final end = DateTime(_focusedDay.year, _focusedDay.month + 2, 0);
    final view = ref.read(calendarViewTypeProvider);
    return '${start.toIso8601String()}|${end.toIso8601String()}|$view';
  }

  @override
  Widget build(BuildContext context) {
    final eventsKey = _buildEventsKey();
    final eventsAsync = ref.watch(eventsProvider(eventsKey));
    final viewType = ref.watch(calendarViewTypeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Planner'),
        actions: [
          // Today button
          IconButton(
            icon: const Icon(Icons.today),
            tooltip: 'Today',
            onPressed: () => setState(() {
              _focusedDay = DateTime.now();
              _selectedDay = DateTime.now();
            }),
          ),
          // My/Team toggle
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'my', label: Text('My')),
              ButtonSegment(value: 'team', label: Text('Team')),
            ],
            selected: {viewType},
            onSelectionChanged: (value) {
              ref.read(calendarViewTypeProvider.notifier).state = value.first;
            },
            style: ButtonStyle(
              visualDensity: VisualDensity.compact,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          eventsAsync.when(
            data: (events) => _buildCalendar(events),
            loading: () => _buildCalendar([]),
            error: (e, _) => _buildCalendar([]),
          ),
          const Divider(height: 1),
          Expanded(
            child: eventsAsync.when(
              data: (events) => _buildDayEventList(events),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/planner/events/create', extra: _selectedDay),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildCalendar(List<Event> events) {
    return TableCalendar<Event>(
      firstDay: DateTime(2020),
      lastDay: DateTime(2030),
      focusedDay: _focusedDay,
      selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
      calendarFormat: _calendarFormat,
      availableCalendarFormats: const {
        CalendarFormat.month: 'Month',
        CalendarFormat.twoWeeks: 'Week',
        CalendarFormat.week: 'Day',
      },
      eventLoader: (day) {
        return events.where((e) {
          final eventDate = DateTime.parse(e.startAt);
          return isSameDay(eventDate, day);
        }).toList();
      },
      onDaySelected: (selectedDay, focusedDay) {
        setState(() {
          _selectedDay = selectedDay;
          _focusedDay = focusedDay;
        });
      },
      onFormatChanged: (format) {
        setState(() => _calendarFormat = format);
      },
      onPageChanged: (focusedDay) {
        setState(() => _focusedDay = focusedDay);
      },
      calendarStyle: CalendarStyle(
        todayDecoration: BoxDecoration(
          color: AppTheme.primaryColor.withValues(alpha: 0.3),
          shape: BoxShape.circle,
        ),
        selectedDecoration: BoxDecoration(
          color: AppTheme.primaryColor,
          shape: BoxShape.circle,
        ),
        markerDecoration: const BoxDecoration(
          color: Colors.transparent,
        ),
      ),
      calendarBuilders: CalendarBuilders(
        markerBuilder: (context, date, events) {
          if (events.isEmpty) return null;
          return Positioned(
            bottom: 1,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: events.take(3).map((e) {
                return Container(
                  width: 6,
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 0.5),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: e.eventType.color,
                  ),
                );
              }).toList(),
            ),
          );
        },
      ),
      headerStyle: const HeaderStyle(
        formatButtonShowsNext: false,
        titleCentered: true,
      ),
    );
  }

  Widget _buildDayEventList(List<Event> allEvents) {
    final dayEvents = allEvents.where((e) {
      final eventDate = DateTime.parse(e.startAt);
      return isSameDay(eventDate, _selectedDay ?? DateTime.now());
    }).toList()
      ..sort((a, b) => a.startAt.compareTo(b.startAt));

    if (dayEvents.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_available, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 8),
            Text(
              'No events for this day',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: dayEvents.length,
      itemBuilder: (context, index) {
        final event = dayEvents[index];
        return _EventCard(event: event);
      },
    );
  }
}

class _EventCard extends StatelessWidget {
  final Event event;
  const _EventCard({required this.event});

  @override
  Widget build(BuildContext context) {
    final startTime = DateTime.tryParse(event.startAt);
    final timeStr = event.allDay
        ? 'All day'
        : startTime != null
            ? DateFormat('h:mm a').format(startTime)
            : '';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => _showEventDetail(context),
        borderRadius: BorderRadius.circular(12),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 64,
              decoration: BoxDecoration(
                color: event.eventType.color,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  bottomLeft: Radius.circular(12),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Icon(event.eventType.icon, size: 20, color: event.eventType.color),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(event.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 2),
                          Text(
                            '$timeStr • ${event.eventType.displayName}',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ),
                    if (event.isRecurring)
                      Icon(Icons.repeat, size: 16, color: Colors.grey.shade500),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showEventDetail(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _EventDetailSheet(event: event),
    );
  }
}

class _EventDetailSheet extends StatelessWidget {
  final Event event;
  const _EventDetailSheet({required this.event});

  @override
  Widget build(BuildContext context) {
    final startTime = DateTime.tryParse(event.startAt);
    final endTime = event.endAt != null ? DateTime.tryParse(event.endAt!) : null;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.5,
      maxChildSize: 0.85,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Type badge
              Chip(
                avatar: Icon(event.eventType.icon, size: 16, color: Colors.white),
                label: Text(event.eventType.displayName, style: const TextStyle(color: Colors.white)),
                backgroundColor: event.eventType.color,
              ),
              const SizedBox(height: 12),
              // Title
              Text(event.title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              // Date & Time
              _infoRow(Icons.access_time, event.allDay
                  ? 'All day'
                  : '${startTime != null ? DateFormat('MMM d, yyyy • h:mm a').format(startTime) : ''}'
                    '${endTime != null ? ' - ${DateFormat("h:mm a").format(endTime)}' : ''}'),
              if (event.location != null && event.location!.isNotEmpty)
                _infoRow(Icons.location_on, event.location!),
              if (event.description != null && event.description!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(event.description!, style: TextStyle(color: Colors.grey.shade700)),
              ],
              if (event.assigneeName != null)
                _infoRow(Icons.person, 'Assigned to: ${event.assigneeName}'),
              if (event.isRecurring)
                _infoRow(Icons.repeat, 'Recurring event'),
              const SizedBox(height: 24),
              // Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        // Navigate only for real (non-synthetic) events
                        if (!event.id.contains('_')) {
                          context.push('/planner/events/${event.id}/edit');
                        }
                      },
                      icon: const Icon(Icons.edit),
                      label: const Text('Edit'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                      label: const Text('Close'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade600),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
