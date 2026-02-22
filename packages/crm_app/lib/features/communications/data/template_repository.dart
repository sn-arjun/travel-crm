import 'package:shared/shared.dart';

class TemplateRepository {
  final ApiClient _apiClient;

  TemplateRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── Get Templates ─────────────────────────────────────────────
  Future<Map<String, dynamic>> getTemplates({
    String? channel,
    String? category,
    String? search,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (channel != null) 'channel': channel,
      if (category != null) 'category': category,
      if (search != null && search.isNotEmpty) 'search': search,
    };

    final response = await _apiClient.get(
      ApiEndpoints.messageTemplates,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  // ── Get Template Detail ───────────────────────────────────────
  Future<Map<String, dynamic>> getTemplate(String id) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.messageTemplates}/$id',
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Create Template ───────────────────────────────────────────
  Future<Map<String, dynamic>> createTemplate(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.messageTemplates,
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Update Template ───────────────────────────────────────────
  Future<Map<String, dynamic>> updateTemplate(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      '${ApiEndpoints.messageTemplates}/$id',
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Delete Template ───────────────────────────────────────────
  Future<void> deleteTemplate(String id) async {
    await _apiClient.delete('${ApiEndpoints.messageTemplates}/$id');
  }
}
