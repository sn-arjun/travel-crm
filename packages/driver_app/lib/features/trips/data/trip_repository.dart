import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class TripRepository {
  final Dio _dio;

  TripRepository(this._dio);

  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.driverAppTrips,
      queryParameters: {'tab': tab, 'page': page, 'limit': limit},
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getTripDetail(String id) async {
    final response = await _dio.get(ApiEndpoints.driverTrip(id));
    return response.data;
  }

  Future<Map<String, dynamic>> acceptTrip(String id) async {
    final response = await _dio.post(ApiEndpoints.driverTripAccept(id));
    return response.data;
  }

  Future<Map<String, dynamic>> rejectTrip(String id, String reason) async {
    final response = await _dio.post(
      ApiEndpoints.driverTripReject(id),
      data: {'reason': reason},
    );
    return response.data;
  }

  Future<Map<String, dynamic>> updateStatus(
    String id,
    String status, {
    double? latitude,
    double? longitude,
    String? notes,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.driverTripStatus(id),
      data: {
        'status': status,
        'latitude': ?latitude,
        'longitude': ?longitude,
        'notes': ?notes,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> checkIn(
    String id, {
    required double latitude,
    required double longitude,
    String? photoBase64,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.driverTripCheckIn(id),
      data: {
        'latitude': latitude,
        'longitude': longitude,
        'photo': ?photoBase64,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> checkOut(
    String id, {
    required double latitude,
    required double longitude,
    String? photoBase64,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.driverTripCheckOut(id),
      data: {
        'latitude': latitude,
        'longitude': longitude,
        'photo': ?photoBase64,
      },
    );
    return response.data;
  }

  // ── Coach trips (R145 API) ──────────────────────────────

  /// Marks a stop arrived or departed. Repeating the call is harmless.
  Future<Map<String, dynamic>> setStopStatus(
    String tripId,
    String stopId,
    String action, {
    double? latitude,
    double? longitude,
  }) async {
    final url = action == 'arrive'
        ? ApiEndpoints.driverTripStopArrive(tripId, stopId)
        : ApiEndpoints.driverTripStopDepart(tripId, stopId);
    final response = await _dio.post(url, data: {
      'lat': ?latitude,
      'lng': ?longitude,
    });
    return response.data;
  }

  /// One tick. [opId] makes a retry safe; [at] is when the tick was made
  /// (ticks sent from the offline queue arrive late).
  Future<Map<String, dynamic>> tickPassenger(
    String tripId,
    String passengerId, {
    String? boarding,
    bool? documentsChecked,
    required String opId,
    String? at,
  }) async {
    final response = await _dio.put(
      ApiEndpoints.driverTripPassenger(tripId, passengerId),
      data: {
        'boarding': ?boarding,
        'documentsChecked': ?documentsChecked,
        'opId': opId,
        'at': ?at,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getPassengers(String tripId) async {
    final response = await _dio.get(ApiEndpoints.driverTripPassengers(tripId));
    return response.data;
  }

  Future<Map<String, dynamic>> getHeadcount(String tripId) async {
    final response = await _dio.get(ApiEndpoints.driverTripHeadcount(tripId));
    return response.data;
  }
}
