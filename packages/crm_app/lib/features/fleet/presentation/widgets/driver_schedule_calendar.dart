import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../data/fleet_repository.dart';

/// Calendar widget showing driver schedules/assignments across a date range.
class DriverScheduleCalendar extends ConsumerStatefulWidget {
  final String? driverId;

  const DriverScheduleCalendar({super.key, this.driverId});

  @override
  ConsumerState<DriverScheduleCalendar> createState() =>
      _DriverScheduleCalendarState();
}

class _DriverScheduleCalendarState
    extends ConsumerState<DriverScheduleCalendar> {
  late DateTime _focusedDay;
  DateTime? _selectedDay;
  CalendarFormat _calendarFormat = CalendarFormat.twoWeeks;
  List<Map<String, dynamic>> _schedule = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _focusedDay = DateTime.now();
    _selectedDay = DateTime.now();
    _loadSchedule();
  }

  Future<void> _loadSchedule() async {
    setState(() => _loading = true);
    try {
      final from = DateTime(_focusedDay.year, _focusedDay.month - 1, 1);
      final to = DateTime(_focusedDay.year, _focusedDay.month + 2, 0);
      final repo = ref.read(fleetRepositoryProvider);
      final data = await repo.getDriverSchedule(
        from: from.toIso8601String().split('T')[0],
        to: to.toIso8601String().split('T')[0],
      );
      if (mounted) setState(() => _schedule = data);
    } catch (_) {
      // Silently handle
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<DateTime, List<_ScheduleEntry>> _buildEventMap() {
    final map = <DateTime, List<_ScheduleEntry>>{};
    for (final driver in _schedule) {
      // If filtering by a specific driver, skip others
      if (widget.driverId != null &&
          driver['id'] != widget.driverId) {
        continue;
      }
      final driverName = driver['name'] as String? ?? '';
      final trips = driver['trips'] as List? ?? [];
      for (final trip in trips) {
        final start = DateTime.tryParse(trip['startDate'] as String? ?? '');
        final end = DateTime.tryParse(trip['endDate'] as String? ?? '');
        if (start == null || end == null) continue;
        for (var d = start;
            !d.isAfter(end);
            d = d.add(const Duration(days: 1))) {
          final key = DateTime(d.year, d.month, d.day);
          map.putIfAbsent(key, () => []).add(_ScheduleEntry(
            driverName: driverName,
            route: trip['route'] as String? ?? '',
            vehicleReg: trip['vehicleRegistration'] as String? ?? '',
            status: trip['status'] as String? ?? 'scheduled',
          ));
        }
      }
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final eventMap = _buildEventMap();

    return Column(
      children: [
        TableCalendar(
          firstDay: DateTime.now().subtract(const Duration(days: 365)),
          lastDay: DateTime.now().add(const Duration(days: 365)),
          focusedDay: _focusedDay,
          selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
          calendarFormat: _calendarFormat,
          onFormatChanged: (format) =>
              setState(() => _calendarFormat = format),
          onDaySelected: (selectedDay, focusedDay) {
            setState(() {
              _selectedDay = selectedDay;
              _focusedDay = focusedDay;
            });
          },
          onPageChanged: (focusedDay) {
            _focusedDay = focusedDay;
            _loadSchedule();
          },
          eventLoader: (day) {
            final key = DateTime(day.year, day.month, day.day);
            return eventMap[key] ?? [];
          },
          calendarBuilders: CalendarBuilders(
            markerBuilder: (context, day, events) {
              if (events.isEmpty) return null;
              final entries = events.cast<_ScheduleEntry>();
              return Positioned(
                bottom: 1,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: entries.take(3).map((e) {
                    return Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.symmetric(horizontal: 0.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _statusColor(e.status),
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (_selectedDay != null) ...[
          const Divider(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text(
                  DateFormat.yMMMd().format(_selectedDay!),
                  style: theme.textTheme.titleSmall,
                ),
                const Spacer(),
                _legendDot(Colors.orange, 'Scheduled'),
                const SizedBox(width: 8),
                _legendDot(Colors.blue, 'In Progress'),
                const SizedBox(width: 8),
                _legendDot(Colors.green, 'Completed'),
              ],
            ),
          ),
          ..._buildDayEntries(eventMap),
        ],
      ],
    );
  }

  List<Widget> _buildDayEntries(
      Map<DateTime, List<_ScheduleEntry>> eventMap) {
    if (_selectedDay == null) return [];
    final key =
        DateTime(_selectedDay!.year, _selectedDay!.month, _selectedDay!.day);
    final entries = eventMap[key] ?? [];
    if (entries.isEmpty) {
      return [
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(
            child: Text('No assignments',
                style: TextStyle(color: Colors.grey)),
          ),
        ),
      ];
    }
    return entries
        .map((e) => ListTile(
              leading: CircleAvatar(
                backgroundColor: _statusColor(e.status).withValues(alpha: 0.15),
                child: Icon(Icons.person, color: _statusColor(e.status), size: 20),
              ),
              title: Text(e.driverName),
              subtitle: Text('${e.route}  •  ${e.vehicleReg}'),
              trailing: Chip(
                label: Text(e.status,
                    style: const TextStyle(fontSize: 11)),
                backgroundColor:
                    _statusColor(e.status).withValues(alpha: 0.1),
                side: BorderSide.none,
                padding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
              ),
            ))
        .toList();
  }

  Widget _legendDot(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
        ),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 11)),
      ],
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'in_progress':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }
}

class _ScheduleEntry {
  final String driverName;
  final String route;
  final String vehicleReg;
  final String status;

  const _ScheduleEntry({
    required this.driverName,
    required this.route,
    required this.vehicleReg,
    required this.status,
  });
}
