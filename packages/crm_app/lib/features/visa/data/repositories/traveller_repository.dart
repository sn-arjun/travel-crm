import 'package:shared/shared.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/traveller.dart';
import '../../../auth/data/auth_provider.dart';

final travellerRepositoryProvider = Provider<TravellerRepository>((ref) {
  return TravellerRepository(ref.watch(apiClientProvider));
});

class TravellerRepository {
  final ApiClient _apiClient;

  TravellerRepository(this._apiClient);

  Future<PaginatedResponse<Traveller>> getTravellers({
    String? contactId,
  }) async {
    final Map<String, dynamic> queryParameters = {};
    if (contactId != null) queryParameters['contact_id'] = contactId;

    final response = await _apiClient.get(
      ApiEndpoints.travellers,
      queryParameters: queryParameters,
    );
    
    final data = (response.data['data'] as List).map((e) => Traveller.fromJson(e)).toList();
    return PaginatedResponse(
      data: data,
      pagination: PaginationMeta.fromJson(response.data['meta'] ?? {}),
    );
  }

  Future<Traveller> getTraveller(String id) async {
    final response = await _apiClient.get(ApiEndpoints.traveller(id));
    return Traveller.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<Traveller> createTraveller(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.travellers, data: data);
    return Traveller.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<Traveller> updateTraveller(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.traveller(id), data: data);
    return Traveller.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteTraveller(String id) async {
    await _apiClient.delete(ApiEndpoints.traveller(id));
  }
}
