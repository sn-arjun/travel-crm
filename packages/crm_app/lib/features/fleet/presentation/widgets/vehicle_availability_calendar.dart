import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../data/fleet_repository.dart';

/// Calendar widget that shows vehicle availability across a date range.
/// Each vehicle gets a row, and booked days are marked with colored blocks.
class VehicleAvailabilityCalendar extends ConsumerStatefulWidget {
  final String? vehicleType;

  const VehicleAvailabilityCalendar({super.key, this.vehicleType});

  @override
  ConsumerState<VehicleAvailabilityCalendar> createState() =>
      _VehicleAvailabilityCalendarState();
}

class _VehicleAvailabilityCalendarState
    extends ConsumerState<VehicleAvailabilityCalendar> {
  late DateTime _focusedDay;
  DateTime? _selectedDay;
  CalendarFormat _calendarFormat = CalendarFormat.twoWeeks;
  List<Map<String, dynamic>> _availability = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _focusedDay = DateTime.now();
    _selectedDay = DateTime.now();
    _loadAvailability();
  }

  Future<void> _loadAvailability() async {
    setState(() => _loading = true);
    try {
      final from = DateTime(_focusedDay.year, _focusedDay.month - 1, 1);
      final to = DateTime(_focusedDay.year, _focusedDay.month + 2, 0);
      final repo = ref.read(fleetRepositoryProvider);
      final data = await repo.getVehicleAvailability(
        from: from.toIso8601String().split('T')[0],
        to: to.toIso8601String().split('T')[0],
        type: widget.vehicleType,
      );
      if (mounted) setState(() => _availability = data);
    } catch (_) {
      // Silently handle — calendar just won't show bookings
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Build a map: date -> list of vehicle booking entries for that date.
  Map<DateTime, List<_BookingEntry>> _buildEventMap() {
    final map = <DateTime, List<_BookingEntry>>{};
    for (final vehicle in _availability) {
      final regNo = vehicle['registrationNumber'] as String? ?? '';
      final trips = vehicle['trips'] as List? ?? [];
      for (final trip in trips) {
        final start = DateTime.tryParse(trip['startDate'] as String? ?? '');
        final end = DateTime.tryParse(trip['endDate'] as String? ?? '');
        if (start == null || end == null) continue;
        for (var d = start;
            !d.isAfter(end);
            d = d.add(const Duration(days: 1))) {
          final key = DateTime(d.year, d.month, d.day);
          map.putIfAbsent(key, () => []).add(_BookingEntry(
            vehicleReg: regNo,
            tripRoute: trip['route'] as String? ?? '',
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
            _loadAvailability();
          },
          eventLoader: (day) {
            final key = DateTime(day.year, day.month, day.day);
            return eventMap[key] ?? [];
          },
          calendarBuilders: CalendarBuilders(
            markerBuilder: (context, day, events) {
              if (events.isEmpty) return null;
              final bookings = events.cast<_BookingEntry>();
              return Positioned(
                bottom: 1,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: bookings.take(3).map((b) {
                    return Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.symmetric(horizontal: 0.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _statusColor(b.status),
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
          ..._buildDayBookings(eventMap),
        ],
      ],
    );
  }

  List<Widget> _buildDayBookings(Map<DateTime, List<_BookingEntry>> eventMap) {
    if (_selectedDay == null) return [];
    final key =
        DateTime(_selectedDay!.year, _selectedDay!.month, _selectedDay!.day);
    final bookings = eventMap[key] ?? [];
    if (bookings.isEmpty) {
      return [
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(
            child: Text('All vehicles available',
                style: TextStyle(color: Colors.grey)),
          ),
        ),
      ];
    }
    return bookings
        .map((b) => ListTile(
              leading: CircleAvatar(
                backgroundColor: _statusColor(b.status).withValues(alpha: 0.15),
                child: Icon(Icons.directions_car,
                    color: _statusColor(b.status), size: 20),
              ),
              title: Text(b.vehicleReg),
              subtitle: Text(b.tripRoute),
              trailing: Chip(
                label: Text(b.status,
                    style: const TextStyle(fontSize: 11)),
                backgroundColor:
                    _statusColor(b.status).withValues(alpha: 0.1),
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

class _BookingEntry {
  final String vehicleReg;
  final String tripRoute;
  final String status;

  const _BookingEntry({
    required this.vehicleReg,
    required this.tripRoute,
    required this.status,
  });
}
