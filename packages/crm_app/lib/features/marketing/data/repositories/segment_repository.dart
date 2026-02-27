import 'package:shared/shared.dart';

class SegmentRepository {
  final ApiClient _apiClient;

  SegmentRepository(this._apiClient);

  Future<PaginatedResponse<ContactSegmentModel>> getSegments({
    int page = 1,
    int limit = 20,
    String? search,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingSegments,
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'search': ?search,
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => ContactSegmentModel.fromJson(json),
    );
  }

  Future<ContactSegmentModel> getSegment(String id) async {
    final response = await _apiClient.get(ApiEndpoints.marketingSegment(id));
    return ContactSegmentModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<PaginatedResponse<ContactModel>> getSegmentContacts(
    String id, {
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingSegmentContacts(id),
      queryParameters: {'page': page.toString(), 'limit': limit.toString()},
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => ContactModel.fromJson(json),
    );
  }

  Future<ContactSegmentModel> createSegment(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.marketingSegments,
      data: data,
    );
    return ContactSegmentModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ContactSegmentModel> updateSegment(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.marketingSegment(id),
      data: data,
    );
    return ContactSegmentModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<int> refreshSegmentCount(String id) async {
    final response = await _apiClient.post(
      ApiEndpoints.marketingSegmentRefresh(id),
    );
    return (response.data['data']['contact_count'] as num).toInt();
  }

  Future<void> deleteSegment(String id) async {
    await _apiClient.delete(ApiEndpoints.marketingSegment(id));
  }
}
