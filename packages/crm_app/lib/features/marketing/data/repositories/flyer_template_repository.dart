import 'package:shared/shared.dart';

class FlyerTemplateRepository {
  final ApiClient _apiClient;

  FlyerTemplateRepository(this._apiClient);

  Future<PaginatedResponse<FlyerTemplateModel>> getTemplates({
    int page = 1,
    int limit = 20,
    String? category,
    String? sizePreset,
    String? search,
    bool? isQuickCreate,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.flyerTemplates,
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'category': ?category,
        'size_preset': ?sizePreset,
        'search': ?search,
        if (isQuickCreate != null) 'is_quick_create': isQuickCreate.toString(),
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => FlyerTemplateModel.fromJson(json),
    );
  }

  Future<FlyerTemplateModel> getTemplate(String id) async {
    final response = await _apiClient.get(ApiEndpoints.flyerTemplate(id));
    return FlyerTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<FlyerTemplateModel> createTemplate(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.flyerTemplates,
      data: data,
    );
    return FlyerTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<FlyerTemplateModel> updateTemplate(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.flyerTemplate(id),
      data: data,
    );
    return FlyerTemplateModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteTemplate(String id) async {
    await _apiClient.delete(ApiEndpoints.flyerTemplate(id));
  }
}
