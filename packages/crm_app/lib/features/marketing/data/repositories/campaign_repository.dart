import 'package:shared/shared.dart';

class MarketingCampaignRepository {
  final ApiClient _apiClient;

  MarketingCampaignRepository(this._apiClient);

  Future<PaginatedResponse<MarketingCampaignModel>> getCampaigns({
    int page = 1,
    int limit = 20,
    String? type,
    String? status,
    String? search,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingCampaigns,
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'type': ?type,
        'status': ?status,
        'search': ?search,
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => MarketingCampaignModel.fromJson(json),
    );
  }

  Future<MarketingCampaignModel> getCampaign(String id) async {
    final response = await _apiClient.get(ApiEndpoints.marketingCampaign(id));
    return MarketingCampaignModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<CampaignAnalyticsModel> getCampaignAnalytics(String id) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingCampaignAnalytics(id),
    );
    return CampaignAnalyticsModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<PaginatedResponse<CampaignRecipientModel>> getCampaignRecipients(
    String id, {
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingCampaignRecipients(id),
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'status': ?status,
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => CampaignRecipientModel.fromJson(json),
    );
  }

  Future<MarketingCampaignModel> createCampaign(
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.post(
      ApiEndpoints.marketingCampaigns,
      data: data,
    );
    return MarketingCampaignModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<MarketingCampaignModel> updateCampaign(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.marketingCampaign(id),
      data: data,
    );
    return MarketingCampaignModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> sendCampaign(String id) async {
    await _apiClient.post(ApiEndpoints.marketingCampaignSend(id));
  }

  Future<void> cancelCampaign(String id) async {
    await _apiClient.post(ApiEndpoints.marketingCampaignCancel(id));
  }

  Future<void> deleteCampaign(String id) async {
    await _apiClient.delete(ApiEndpoints.marketingCampaign(id));
  }
}
