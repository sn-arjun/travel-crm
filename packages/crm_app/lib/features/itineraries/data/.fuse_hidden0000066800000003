import 'package:shared/shared.dart';

class RateCardRepository {
  final ApiClient _apiClient;

  RateCardRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<RateCardListResponse> getRateCards({
    int page = 1,
    int limit = 20,
    String? search,
    String? serviceType,
    String? destination,
    String? season,
    String? supplierId,
    bool? isActive,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (search != null && search.isNotEmpty) 'search': search,
      'serviceType': ?serviceType,
      'destination': ?destination,
      'season': ?season,
      'supplierId': ?supplierId,
      if (isActive != null) 'isActive': isActive.toString(),
    };

    final response = await _apiClient.get(
      ApiEndpoints.rateCards,
      queryParameters: params,
    );
    return RateCardListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<List<RateCardModel>> lookupRateCards({
    String? type,
    String? destination,
    String? season,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.rateCardsLookup,
      queryParameters: {
        'type': ?type,
        'destination': ?destination,
        'season': ?season,
      },
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => RateCardModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<RateCardModel> getRateCard(String id) async {
    final response = await _apiClient.get(ApiEndpoints.rateCard(id));
    return RateCardModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<RateCardModel> createRateCard(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.rateCards,
      data: data,
    );
    return RateCardModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<RateCardModel> updateRateCard(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.rateCard(id),
      data: data,
    );
    return RateCardModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteRateCard(String id) async {
    await _apiClient.delete(ApiEndpoints.rateCard(id));
  }
}

// ── RateCardListResponse ───────────────────────────────────

class RateCardListResponse {
  final List<RateCardModel> data;
  final PaginationMeta? pagination;

  const RateCardListResponse({required this.data, this.pagination});

  factory RateCardListResponse.fromJson(Map<String, dynamic> json) {
    final dataList = (json['data'] as List? ?? [])
        .map((e) => RateCardModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final paginationJson = json['pagination'];
    return RateCardListResponse(
      data: dataList,
      pagination: paginationJson != null
          ? PaginationMeta.fromJson(paginationJson as Map<String, dynamic>)
          : null,
    );
  }
}
