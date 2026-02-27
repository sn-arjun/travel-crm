import 'package:flutter/material.dart';
import '../../../features/planner/data/models/event.dart';

/// Centralized event type colors and icons for calendar rendering.
///
/// Usage:
/// ```dart
/// final color = EventTypeColors.getColor(event.eventType);
/// final icon = EventTypeColors.getIcon(event.eventType);
/// ```
class EventTypeColors {
  EventTypeColors._();

  static const Map<EventType, Color> colors = {
    EventType.tripDeparture: Color(0xFF2196F3),
    EventType.tripReturn: Color(0xFF2196F3),
    EventType.meeting: Color(0xFF9C27B0),
    EventType.followUp: Color(0xFFFF9800),
    EventType.deadline: Color(0xFFF44336),
    EventType.reminder: Color(0xFFFFC107),
    EventType.holiday: Color(0xFF4CAF50),
  };

  static const Map<EventType, IconData> icons = {
    EventType.tripDeparture: Icons.flight_takeoff,
    EventType.tripReturn: Icons.flight_land,
    EventType.meeting: Icons.people,
    EventType.followUp: Icons.phone_callback,
    EventType.deadline: Icons.flag,
    EventType.reminder: Icons.notifications_active,
    EventType.holiday: Icons.beach_access,
  };

  static Color getColor(EventType type) => colors[type] ?? Colors.grey;
  static Color getColorFromString(String type) {
    final t = EventType.values.where((e) => e.name == type || e.toString().endsWith(type));
    return t.isNotEmpty ? getColor(t.first) : Colors.grey;
  }

  static IconData getIcon(EventType type) => icons[type] ?? Icons.event;
}
