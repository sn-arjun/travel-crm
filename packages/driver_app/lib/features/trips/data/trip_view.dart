import 'package:shared/shared.dart';

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

  /// An ISO-8601 string (such as a stop's `scheduledAt`) in the device time zone.
  static DateTime? parseTime(String? iso) => _date(iso);

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

// ── Coach trips (R145 fields) ─────────────────────────────

/// The "N stops, M passengers" summary a trip list row carries for a coach.
class CoachSummary {
  final int stopCount;
  final int passengerCount;
  final String? nextStopName;
  final DateTime? nextStopAt;

  const CoachSummary({
    required this.stopCount,
    required this.passengerCount,
    this.nextStopName,
    this.nextStopAt,
  });
}

/// Seats per boarding state for [passengers] (all of them, or the ones of one
/// stop when the caller filters first).
TripHeadcount computeHeadcount(
  List<TripStop> stops,
  List<TripPassenger> passengers,
) {
  var expected = 0, boarded = 0, noShow = 0, docs = 0;
  final per = <String?, List<int>>{}; // expected, boarded, noShow
  final stopIds = stops.map((s) => s.id).toSet();
  for (final p in passengers) {
    final key = p.tripStopId != null && stopIds.contains(p.tripStopId)
        ? p.tripStopId
        : null;
    final slot = per.putIfAbsent(key, () => [0, 0, 0]);
    expected += p.seats;
    slot[0] += p.seats;
    if (p.boarding == 'boarded') {
      boarded += p.seats;
      slot[1] += p.seats;
    } else if (p.boarding == 'no_show') {
      noShow += p.seats;
      slot[2] += p.seats;
    }
    if (p.documentsChecked) docs += p.seats;
  }
  TripStopHeadcount row(String? id, String? name, int order) {
    final s = per[id] ?? [0, 0, 0];
    return TripStopHeadcount(
      stopId: id,
      name: name,
      sortOrder: order,
      expected: s[0],
      boarded: s[1],
      noShow: s[2],
      pending: s[0] - s[1] - s[2],
    );
  }

  return TripHeadcount(
    expected: expected,
    boarded: boarded,
    noShow: noShow,
    pending: expected - boarded - noShow,
    documentsChecked: docs,
    byStop: [
      for (final s in stops) row(s.id, s.name, s.sortOrder),
      if (per.containsKey(null)) row(null, null, 0),
    ],
  );
}

/// Coach fields of a trip map. Every getter is null-safe: a transfer has none
/// of them, and a driver the agency does not allow to see passengers gets no
/// `passengers` key at all.
extension CoachTripView on TripView {
  bool get isCoach => raw['tripKind'] == 'coach';

  /// `tour_leader` or `driver` (the server's `myRole` on the trip detail).
  String? get myRole => TripView._str(raw['myRole']);

  /// Stops in the order the coach visits them.
  List<TripStop> get stops {
    final list = _parseList<TripStop>(raw['stops'], TripStop.fromJson);
    list.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return list;
  }

  /// Null when the server did not send passengers (a driver without the right).
  List<TripPassenger>? get passengers => raw['passengers'] is List
      ? _parseList<TripPassenger>(raw['passengers'], TripPassenger.fromJson)
      : null;

  bool get hasPassengers => passengers != null;

  /// The head count: computed from the passengers when present (so a tick
  /// shows at once), else the server's.
  TripHeadcount? get headcount {
    final p = passengers;
    if (p != null) return computeHeadcount(stops, p);
    final h = raw['headcount'];
    if (h is! Map) return null;
    try {
      return TripHeadcount.fromJson(Map<String, dynamic>.from(h));
    } catch (_) {
      return null;
    }
  }

  /// "N stops, M passengers" and the next stop: from the list row's `coach`
  /// block, else worked out from the stops and passengers of the detail.
  CoachSummary? get coachSummary {
    if (!isCoach) return null;
    final c = raw['coach'];
    if (c is Map) {
      final next = c['nextStop'];
      return CoachSummary(
        stopCount: (c['stopCount'] as num?)?.toInt() ?? 0,
        passengerCount: (c['passengerCount'] as num?)?.toInt() ?? 0,
        nextStopName: next is Map ? TripView._str(next['name']) : null,
        nextStopAt: next is Map ? TripView._date(next['scheduledAt']) : null,
      );
    }
    final s = stops;
    final p = passengers;
    final next = s.where((x) => x.status == 'pending' || x.status == 'arrived');
    final first = next.isEmpty ? null : next.first;
    return CoachSummary(
      stopCount: s.length,
      passengerCount: p?.fold<int>(0, (sum, x) => sum + x.seats) ??
          headcount?.expected ??
          0,
      nextStopName: first?.name,
      nextStopAt: first == null ? null : TripView._date(first.scheduledAt),
    );
  }

  static List<T> _parseList<T>(
    dynamic data,
    T Function(Map<String, dynamic>) parse,
  ) {
    if (data is! List) return <T>[];
    final out = <T>[];
    for (final item in data) {
      if (item is! Map) continue;
      try {
        out.add(parse(Map<String, dynamic>.from(item)));
      } catch (_) {
        // One malformed row must not hide the rest of the trip.
      }
    }
    return out;
  }
}
