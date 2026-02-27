import 'package:shared/shared.dart';

class BrandingRepository {
  final ApiClient _apiClient;

  BrandingRepository(this._apiClient);

  Future<TenantBrandingModel> getBranding() async {
    final response = await _apiClient.get(ApiEndpoints.marketingBranding);
    return TenantBrandingModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<TenantBrandingModel> updateBranding(Map<String, dynamic> data) async {
    final response = await _apiClient.put(
      ApiEndpoints.marketingBranding,
      data: data,
    );
    return TenantBrandingModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }
}
