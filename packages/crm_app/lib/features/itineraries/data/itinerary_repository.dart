import 'package:shared/shared.dart';

class ItineraryRepository {
  final ApiClient _apiClient;

  ItineraryRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<ItineraryListResponse> getItineraries({
    int page = 1,
    int limit = 20,
    String? search,
    String? status,
    String? leadId,
    String? createdBy,
    String sortBy = 'createdAt',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
      if (search != null && search.isNotEmpty) 'search': search,
      if (status != null) 'status': status,
      if (leadId != null) 'leadId': leadId,
      if (createdBy != null) 'createdBy': createdBy,
    };

    final response = await _apiClient.get(
      ApiEndpoints.itineraries,
      queryParameters: params,
    );
    return ItineraryListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<ItineraryModel> getItinerary(String id) async {
    final response = await _apiClient.get(ApiEndpoints.itinerary(id));
    return ItineraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ItineraryModel> createItinerary(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraries,
      data: data,
    );
    return ItineraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ItineraryModel> updateItinerary(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.itinerary(id),
      data: data,
    );
    return ItineraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteItinerary(String id) async {
    await _apiClient.delete(ApiEndpoints.itinerary(id));
  }

  // ── Clone ─────────────────────────────────────────────────

  Future<ItineraryModel> cloneItinerary(
    String id, {
    String? targetLeadId,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryClone(id),
      data: {
        if (targetLeadId != null) 'targetLeadId': targetLeadId,
      },
    );
    return ItineraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Versioning ────────────────────────────────────────────

  Future<Map<String, dynamic>> createNewVersion(String id) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryNewVersion(id),
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> getVersions(String id) async {
    final response = await _apiClient.get(
      ApiEndpoints.itineraryVersions(id),
    );
    final list = response.data['data'] as List;
    return list.cast<Map<String, dynamic>>();
  }

  // ── Send / Share ──────────────────────────────────────────

  Future<void> sendItinerary(
    String id, {
    required String channel,
    required String to,
    String? subject,
    String? message,
  }) async {
    await _apiClient.post(
      ApiEndpoints.itinerarySend(id),
      data: {
        'channel': channel,
        'to': to,
        if (subject != null) 'subject': subject,
        if (message != null) 'message': message,
      },
    );
  }

  Future<Map<String, dynamic>> createShareLink(String id) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryShareLink(id),
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> revokeShareLink(String id) async {
    await _apiClient.delete(ApiEndpoints.itineraryShareLink(id));
  }
}

// ── ItineraryListResponse ──────────────────────────────────

class ItineraryListResponse {
  final List<ItinerarySummary> data;
  final PaginationMeta? pagination;

  const ItineraryListResponse({required this.data, this.pagination});

  factory ItineraryListResponse.fromJson(Map<String, dynamic> json) {
    final dataList = (json['data'] as List? ?? [])
        .map((e) => ItinerarySummary.fromJson(e as Map<String, dynamic>))
        .toList();
    final paginationJson = json['pagination'];
    return ItineraryListResponse(
      data: dataList,
      pagination: paginationJson != null
          ? PaginationMeta.fromJson(paginationJson as Map<String, dynamic>)
          : null,
    );
  }
}
