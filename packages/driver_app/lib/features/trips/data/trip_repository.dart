import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class TripRepository {
  final Dio _dio;

  TripRepository(this._dio);

  Future<Map<String, dynamic>> getTrips({
    required String tab,
    int limit = 20,
    int offset = 0,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.driverAppTrips,
      queryParameters: {'tab': tab, 'limit': limit, 'offset': offset},
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
}
