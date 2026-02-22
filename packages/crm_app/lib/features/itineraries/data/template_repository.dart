import 'package:shared/shared.dart';

class TemplateRepository {
  final ApiClient _apiClient;

  TemplateRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<TemplateListResponse> getTemplates({
    int page = 1,
    int limit = 20,
    String? search,
    String? destination,
    String? category,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (search != null && search.isNotEmpty) 'search': search,
      if (destination != null) 'destination': destination,
      if (category != null) 'category': category,
    };

    final response = await _apiClient.get(
      ApiEndpoints.itineraryTemplates,
      queryParameters: params,
    );
    return TemplateListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<ItineraryTemplateModel> getTemplate(String id) async {
    final response = await _apiClient.get(ApiEndpoints.itineraryTemplate(id));
    return ItineraryTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ItineraryTemplateModel> createTemplate(
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryTemplates,
      data: data,
    );
    return ItineraryTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteTemplate(String id) async {
    await _apiClient.delete(ApiEndpoints.itineraryTemplate(id));
  }

  // ── Save from / Create from ───────────────────────────────

  Future<ItineraryTemplateModel> saveFromItinerary({
    required String itineraryId,
    required String title,
    String? description,
    String? destination,
    String? category,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryTemplateFromItinerary,
      data: {
        'itineraryId': itineraryId,
        'title': title,
        if (description != null) 'description': description,
        if (destination != null) 'destination': destination,
        if (category != null) 'category': category,
      },
    );
    return ItineraryTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<Map<String, dynamic>> createFromTemplate({
    required String templateId,
    required String leadId,
    String? title,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.itineraryFromTemplate,
      data: {
        'templateId': templateId,
        'leadId': leadId,
        if (title != null) 'title': title,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }
}

// ── TemplateListResponse ───────────────────────────────────

class TemplateListResponse {
  final List<ItineraryTemplateModel> data;
  final PaginationMeta? pagination;

  const TemplateListResponse({required this.data, this.pagination});

  factory TemplateListResponse.fromJson(Map<String, dynamic> json) {
    final dataList = (json['data'] as List? ?? [])
        .map(
          (e) =>
              ItineraryTemplateModel.fromJson(e as Map<String, dynamic>),
        )
        .toList();
    final paginationJson = json['pagination'];
    return TemplateListResponse(
      data: dataList,
      pagination: paginationJson != null
          ? PaginationMeta.fromJson(paginationJson as Map<String, dynamic>)
          : null,
    );
  }
}
