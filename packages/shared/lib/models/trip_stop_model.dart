import 'package:freezed_annotation/freezed_annotation.dart';

part 'trip_stop_model.freezed.dart';
part 'trip_stop_model.g.dart';

/// One stop of a coach trip, in the order the coach visits them (R145).
@freezed
abstract class TripStop with _$TripStop {
  const factory TripStop({
    required String id,
    String? tripId,
    String? departureStopId,
    @Default(0) int sortOrder,
    @Default('') String name,
    String? address,
    double? lat,
    double? lng,

    /// ISO-8601 instant the coach is due at this stop.
    String? scheduledAt,

    /// The crew checks passenger documents at this stop.
    @Default(false) bool documentsCheck,

    /// pending | arrived | departed | skipped
    @Default('pending') String status,
    String? arrivedAt,
    String? departedAt,
  }) = _TripStop;

  factory TripStop.fromJson(Map<String, dynamic> json) =>
      _$TripStopFromJson(json);
}

/// A passenger as the crew of a coach trip sees them: never document numbers,
/// notes or contact links.
@freezed
abstract class TripPassenger with _$TripPassenger {
  const factory TripPassenger({
    required String id,
    String? tripStopId,
    @Default('') String name,
    String? phone,
    @Default(1) int seats,

    /// pending | boarded | no_show
    @Default('pending') String boarding,
    String? boardedAt,
    @Default(false) bool documentsChecked,
    String? documentsCheckedAt,
  }) = _TripPassenger;

  factory TripPassenger.fromJson(Map<String, dynamic> json) =>
      _$TripPassengerFromJson(json);
}

/// Head count of a coach trip (seats, not people records).
@freezed
abstract class TripHeadcount with _$TripHeadcount {
  const factory TripHeadcount({
    @Default(0) int expected,
    @Default(0) int boarded,
    @Default(0) int noShow,
    @Default(0) int pending,
    @Default(0) int documentsChecked,
    @Default(<TripStopHeadcount>[]) List<TripStopHeadcount> byStop,
  }) = _TripHeadcount;

  factory TripHeadcount.fromJson(Map<String, dynamic> json) =>
      _$TripHeadcountFromJson(json);
}

@freezed
abstract class TripStopHeadcount with _$TripStopHeadcount {
  const factory TripStopHeadcount({
    String? stopId,
    String? name,
    @Default(0) int sortOrder,
    @Default(0) int expected,
    @Default(0) int boarded,
    @Default(0) int noShow,
    @Default(0) int pending,
  }) = _TripStopHeadcount;

  factory TripStopHeadcount.fromJson(Map<String, dynamic> json) =>
      _$TripStopHeadcountFromJson(json);
}
