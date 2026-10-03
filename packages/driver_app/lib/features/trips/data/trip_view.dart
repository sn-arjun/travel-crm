/// Read-only view over a raw trip map returned by the driver API.
///
/// The backend (`formatTripForDriver`) returns camelCase keys with the vehicle
/// nested under `vehicle`. Older cached payloads used flat keys, so every
/// getter falls back to those. All getters are null-safe and never throw.
class TripView {
  final Map<String, dynamic> raw;

  const TripView(this.raw);

  String get id => _str(raw['id']) ?? '';
  String get status => _str(raw['status']) ?? 'assigned';

  String get pickupLocation => _str(raw['pickupLocation']) ?? '';
  String get dropLocation => _str(raw['dropLocation']) ?? '';

  DateTime? get pickupAt => _date(raw['pickupDatetime']);
  DateTime? get dropAt => _date(raw['dropDatetime']);

  String? get passengerName => _str(raw['passengerName']);
  String? get passengerPhone => _str(raw['passengerPhone']);
  String? get specialInstructions => _str(raw['specialInstructions']);
  String? get leadTitle => _str(raw['leadTitle']);

  /// When dispatch assigned the trip to this driver.
  DateTime? get assignedAt => _date(raw['createdAt']);
  DateTime? get acceptedAt => _date(raw['acceptedAt']);
  DateTime? get enRouteAt => _date(raw['enRouteAt']);
  DateTime? get startedAt => _date(raw['startedAt']);
  DateTime? get completedAt => _date(raw['completedAt']);

  Map<String, dynamic>? get _vehicle {
    final v = raw['vehicle'];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  /// Registration plate: `vehicle.registration`, else `vehicleRegistration`,
  /// else `vehicle_registration`.
  String? get vehicleRegistration =>
      _str(_vehicle?['registration']) ??
      _str(raw['vehicleRegistration']) ??
      _str(raw['vehicle_registration']);

  String? get vehicleMake =>
      _str(_vehicle?['make']) ?? _str(raw['vehicleMake']);
  String? get vehicleModel =>
      _str(_vehicle?['model']) ?? _str(raw['vehicleModel']);
  String? get vehicleType =>
      _str(_vehicle?['type']) ?? _str(raw['vehicleType']);

  /// "Toyota Innova" style label, or null when neither make nor model exist.
  String? get vehicleName {
    final parts = [vehicleMake, vehicleModel].whereType<String>().toList();
    return parts.isEmpty ? null : parts.join(' ');
  }

  /// Pickup / drop coordinates, when the API provides them.
  double? get pickupLat => _num(raw['pickupLat']);
  double? get pickupLng => _num(raw['pickupLng']);
  double? get dropLat => _num(raw['dropLat']);
  double? get dropLng => _num(raw['dropLng']);

  static String? _str(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  static double? _num(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  /// Parses an ISO-8601 timestamp and converts it to the device time zone.
  static DateTime? _date(dynamic v) {
    final s = _str(v);
    if (s == null) return null;
    return DateTime.tryParse(s)?.toLocal();
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  /// "3 Oct 2026, 4:30 PM" in the device time zone.
  static String formatDateTime(DateTime dt) =>
      '${formatDate(dt)}, ${formatTime(dt)}';

  /// "4:30 PM".
  static String formatTime(DateTime dt) {
    final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    final min = dt.minute.toString().padLeft(2, '0');
    return '$hour:$min $amPm';
  }

  /// "3 Oct 2026".
  static String formatDate(DateTime dt) =>
      '${dt.day} ${_months[dt.month - 1]} ${dt.year}';

  /// "Today", "Tomorrow", "Yesterday" or "3 Oct 2026" relative to [now].
  static String relativeDate(DateTime dt, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(dt.year, dt.month, dt.day);
    final diff = day.difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    if (diff == -1) return 'Yesterday';
    return formatDate(dt);
  }
}

/// Convenience accessor: `trip.view` on a raw trip map.
extension TripMapView on Map<String, dynamic> {
  TripView get view => TripView(this);
}
