import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';

final fleetRepositoryProvider = Provider<FleetRepository>((ref) {
  return FleetRepository(ref.watch(apiClientProvider));
});

class FleetRepository {
  final ApiClient _api;
  FleetRepository(this._api);

  // ── Vehicles ─────────────────────────────────────────────

  Future<PaginatedResponse<VehicleModel>> getVehicles({
    int page = 1,
    int limit = 20,
    String? status,
    String? type,
    String? search,
    String? availableFrom,
    String? availableTo,
    String? sortBy,
    String? sortOrder,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'status': ?status,
      'type': ?type,
      if (search != null && search.isNotEmpty) 'search': search,
      'availableFrom': ?availableFrom,
      'availableTo': ?availableTo,
      'sortBy': ?sortBy,
      'sortOrder': ?sortOrder,
    };
    final response = await _api.get(ApiEndpoints.vehicles, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => VehicleModel.fromJson(json),
    );
  }

  Future<Map<String, dynamic>> getVehicleDetail(String id) async {
    final response = await _api.get(ApiEndpoints.vehicle(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<VehicleModel> createVehicle(Map<String, dynamic> data) async {
    final response = await _api.post(ApiEndpoints.vehicles, data: data);
    return VehicleModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<VehicleModel> updateVehicle(String id, Map<String, dynamic> data) async {
    final response = await _api.put(ApiEndpoints.vehicle(id), data: data);
    return VehicleModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteVehicle(String id) async {
    await _api.delete(ApiEndpoints.vehicle(id));
  }

  Future<void> updateVehicleStatus(String id, String status, {String? reason}) async {
    await _api.put(ApiEndpoints.vehicleStatus(id), data: {
      'status': status,
      'reason': ?reason,
    });
  }

  Future<List<Map<String, dynamic>>> getVehicleAvailability({
    required String from,
    required String to,
    String? type,
  }) async {
    final params = <String, dynamic>{
      'from': from,
      'to': to,
      'type': ?type,
    };
    final response = await _api.get(ApiEndpoints.vehiclesAvailability, queryParameters: params);
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }

  Future<List<VehicleDocumentModel>> getVehicleDocuments(String vehicleId) async {
    final response = await _api.get(ApiEndpoints.vehicleDocuments(vehicleId));
    return (response.data['data'] as List)
        .map((e) => VehicleDocumentModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Map<String, dynamic>>> getVehicleMaintenance(String vehicleId) async {
    final response = await _api.get(ApiEndpoints.vehicleMaintenance(vehicleId));
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }

  Future<void> createMaintenance(String vehicleId, Map<String, dynamic> data) async {
    await _api.post(ApiEndpoints.vehicleMaintenance(vehicleId), data: data);
  }

  // ── Drivers ──────────────────────────────────────────────

  Future<PaginatedResponse<DriverModel>> getDrivers({
    int page = 1,
    int limit = 20,
    String? status,
    String? search,
    String? availableFrom,
    String? availableTo,
    String? sortBy,
    String? sortOrder,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'status': ?status,
      if (search != null && search.isNotEmpty) 'search': search,
      'availableFrom': ?availableFrom,
      'availableTo': ?availableTo,
      'sortBy': ?sortBy,
      'sortOrder': ?sortOrder,
    };
    final response = await _api.get(ApiEndpoints.drivers, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => DriverModel.fromJson(json),
    );
  }

  Future<Map<String, dynamic>> getDriverDetail(String id) async {
    final response = await _api.get(ApiEndpoints.driver(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<DriverModel> createDriver(Map<String, dynamic> data) async {
    final response = await _api.post(ApiEndpoints.drivers, data: data);
    return DriverModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<DriverModel> updateDriver(String id, Map<String, dynamic> data) async {
    final response = await _api.put(ApiEndpoints.driver(id), data: data);
    return DriverModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteDriver(String id) async {
    await _api.delete(ApiEndpoints.driver(id));
  }

  Future<void> updateDriverStatus(String id, String status) async {
    await _api.put(ApiEndpoints.driverStatus(id), data: {'status': status});
  }

  Future<void> rateDriver(String id, {required String tripId, required int rating, String? comments}) async {
    await _api.post(ApiEndpoints.driverRate(id), data: {
      'tripId': tripId,
      'rating': rating,
      'comments': ?comments,
    });
  }

  Future<List<Map<String, dynamic>>> getDriverSchedule({
    required String from,
    required String to,
  }) async {
    final response = await _api.get(ApiEndpoints.driversSchedule, queryParameters: {'from': from, 'to': to});
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }

  Future<List<DriverDocumentModel>> getDriverDocuments(String driverId) async {
    final response = await _api.get(ApiEndpoints.driverDocuments(driverId));
    return (response.data['data'] as List)
        .map((e) => DriverDocumentModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Trips ────────────────────────────────────────────────

  Future<PaginatedResponse<TripAssignmentModel>> getTrips({
    int page = 1,
    int limit = 20,
    String? status,
    String? driverId,
    String? vehicleId,
    String? leadId,
    String? from,
    String? to,
    String? search,
    String? sortBy,
    String? sortOrder,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'status': ?status,
      'driverId': ?driverId,
      'vehicleId': ?vehicleId,
      'leadId': ?leadId,
      'from': ?from,
      'to': ?to,
      if (search != null && search.isNotEmpty) 'search': search,
      'sortBy': ?sortBy,
      'sortOrder': ?sortOrder,
    };
    final response = await _api.get(ApiEndpoints.tripAssignments, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => TripAssignmentModel.fromJson(json),
    );
  }

  Future<Map<String, dynamic>> getTripDetail(String id) async {
    final response = await _api.get(ApiEndpoints.tripAssignment(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<TripAssignmentModel> createTrip(Map<String, dynamic> data) async {
    final response = await _api.post(ApiEndpoints.tripAssignments, data: data);
    return TripAssignmentModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<TripAssignmentModel> updateTrip(String id, Map<String, dynamic> data) async {
    final response = await _api.put(ApiEndpoints.tripAssignment(id), data: data);
    return TripAssignmentModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteTrip(String id) async {
    await _api.delete(ApiEndpoints.tripAssignment(id));
  }

  Future<void> updateTripStatus(String id, String status, {String? notes, String? reason, double? latitude, double? longitude}) async {
    await _api.put(ApiEndpoints.tripStatus(id), data: {
      'status': status,
      'notes': ?notes,
      'reason': ?reason,
      'latitude': ?latitude,
      'longitude': ?longitude,
    });
  }

  Future<List<TripTimelineEntry>> getTripTimeline(String id) async {
    final response = await _api.get(ApiEndpoints.tripTimeline(id));
    return (response.data['data'] as List)
        .map((e) => TripTimelineEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> getTripCosts(String id) async {
    final response = await _api.get(ApiEndpoints.tripCosts(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> addTripCost(String tripId, Map<String, dynamic> data) async {
    await _api.post(ApiEndpoints.tripCosts(tripId), data: data);
  }

  Future<void> deleteTripCost(String tripId, String costId) async {
    await _api.delete(ApiEndpoints.tripCostDelete(tripId, costId));
  }

  Future<Map<String, dynamic>> getTripCostSummary(String tripId) async {
    final response = await _api.get(ApiEndpoints.tripCostSummary(tripId));
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Dashboard & Alerts ───────────────────────────────────

  Future<FleetDashboardModel> getDashboard() async {
    final response = await _api.get(ApiEndpoints.fleetDashboard);
    return FleetDashboardModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<List<Map<String, dynamic>>> getExpiringDocuments({int days = 30}) async {
    final response = await _api.get(ApiEndpoints.documentsExpiring, queryParameters: {'days': days});
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }

  Future<List<Map<String, dynamic>>> getMaintenanceDue({int days = 15}) async {
    final response = await _api.get(ApiEndpoints.maintenanceDue, queryParameters: {'days': days});
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }

  // ── Vehicle Rate Cards (M20) ──────────────────────────────

  Future<PaginatedResponse<VehicleRateCardModel>> getVehicleRateCards({
    int page = 1,
    int limit = 20,
    String? vehicleType,
    String? tripType,
    String? isActive,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'vehicleType': ?vehicleType,
      'tripType': ?tripType,
      'isActive': ?isActive,
      if (search != null && search.isNotEmpty) 'search': search,
    };
    final response = await _api.get(ApiEndpoints.vehicleRateCards, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => VehicleRateCardModel.fromJson(json),
    );
  }

  Future<VehicleRateCardModel> getVehicleRateCard(String id) async {
    final response = await _api.get(ApiEndpoints.vehicleRateCard(id));
    return VehicleRateCardModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<VehicleRateCardModel?> lookupRateCard({
    required String vehicleType,
    required String tripType,
  }) async {
    final response = await _api.get(ApiEndpoints.vehicleRateCardsLookup, queryParameters: {
      'vehicleType': vehicleType,
      'tripType': tripType,
    });
    final data = response.data['data'];
    if (data == null) return null;
    return VehicleRateCardModel.fromJson(data as Map<String, dynamic>);
  }

  Future<VehicleRateCardModel> createVehicleRateCard(Map<String, dynamic> data) async {
    final response = await _api.post(ApiEndpoints.vehicleRateCards, data: data);
    return VehicleRateCardModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<VehicleRateCardModel> updateVehicleRateCard(String id, Map<String, dynamic> data) async {
    final response = await _api.put(ApiEndpoints.vehicleRateCard(id), data: data);
    return VehicleRateCardModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteVehicleRateCard(String id) async {
    await _api.delete(ApiEndpoints.vehicleRateCard(id));
  }

  Future<Map<String, dynamic>> estimateTripCost({
    required String rateCardId,
    required double distanceKm,
    required double durationMinutes,
    int? numDays,
    int? numNights,
    bool? isNightTrip,
  }) async {
    final response = await _api.post(ApiEndpoints.vehicleRateCardsEstimate, data: {
      'rateCardId': rateCardId,
      'distanceKm': distanceKm,
      'durationMinutes': durationMinutes,
      'numDays': ?numDays,
      'numNights': ?numNights,
      'isNightTrip': ?isNightTrip,
    });
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> calculateDistance({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    final response = await _api.post(ApiEndpoints.fleetCalculateDistance, data: {
      'originLat': originLat,
      'originLng': originLng,
      'destLat': destLat,
      'destLng': destLng,
    });
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> generateTripInvoice(String tripId) async {
    final response = await _api.post(ApiEndpoints.tripGenerateInvoice(tripId));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> generateTripVoucher(String tripId) async {
    final response = await _api.post(ApiEndpoints.tripGenerateVoucher(tripId));
    return response.data['data'] as Map<String, dynamic>;
  }
}
