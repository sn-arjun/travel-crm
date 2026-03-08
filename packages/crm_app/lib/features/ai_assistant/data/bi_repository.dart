import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';

final biRepositoryProvider = Provider<BiRepository>((ref) {
  return BiRepository(ref.watch(apiClientProvider));
});

class BiRepository {
  final ApiClient _api;
  BiRepository(this._api);

  // ── Briefings ───────────────────────────────────────────────

  Future<AiBriefingModel> generateBriefing(String type) async {
    final resp = await _api.post(ApiEndpoints.biBriefingsGenerate, data: {'type': type});
    return AiBriefingModel.fromJson(resp.data['data']);
  }

  Future<PaginatedResponse<AiBriefingModel>> getBriefings({String? type, int limit = 20, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (type != null) params['type'] = type;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.biBriefings}?$query');
    return PaginatedResponse.fromJson(resp.data, (json) => AiBriefingModel.fromJson(json));
  }

  Future<AiBriefingModel> getBriefing(String id) async {
    final resp = await _api.get(ApiEndpoints.biBriefing(id));
    return AiBriefingModel.fromJson(resp.data['data']);
  }

  // ── Health Score ────────────────────────────────────────────

  Future<BusinessHealthScoreModel> calculateHealthScore() async {
    final resp = await _api.post(ApiEndpoints.biHealthScoreCalculate);
    return BusinessHealthScoreModel.fromJson(resp.data['data']);
  }

  Future<BusinessHealthScoreModel?> getHealthScore() async {
    final resp = await _api.get(ApiEndpoints.biHealthScore);
    if (resp.data['data'] == null) return null;
    return BusinessHealthScoreModel.fromJson(resp.data['data']);
  }

  Future<List<BusinessHealthScoreModel>> getHealthScoreHistory({int limit = 30}) async {
    final resp = await _api.get('${ApiEndpoints.biHealthScoreHistory}?limit=$limit');
    return (resp.data['data'] as List).map((e) => BusinessHealthScoreModel.fromJson(e)).toList();
  }

  // ── Business Analysis ───────────────────────────────────────

  Future<Map<String, dynamic>> getDestinationProfitability() async {
    final resp = await _api.get(ApiEndpoints.biDestinationProfitability);
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getSeasonalDemand() async {
    final resp = await _api.get(ApiEndpoints.biSeasonalDemand);
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getCustomerLtv(String contactId) async {
    final resp = await _api.post(ApiEndpoints.biCustomerLtv(contactId));
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getCashFlowForecast() async {
    final resp = await _api.get(ApiEndpoints.biCashFlowForecast);
    return resp.data['data'] as Map<String, dynamic>;
  }

  // ── Team ────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getTeamPerformance() async {
    final resp = await _api.get(ApiEndpoints.biTeamPerformance);
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<WorkloadAnalysis> getWorkloadAnalysis() async {
    final resp = await _api.get(ApiEndpoints.biWorkloadAnalysis);
    return WorkloadAnalysis.fromJson(resp.data['data']);
  }

  // ── Customer Segments ───────────────────────────────────────

  Future<Map<String, dynamic>> calculateSegments({int limit = 50}) async {
    final resp = await _api.post('${ApiEndpoints.biCustomerSegmentsCalculate}?limit=$limit');
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<PaginatedResponse<CustomerSegmentModel>> getSegments({String? segment, int limit = 50, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (segment != null) params['segment'] = segment;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.biCustomerSegments}?$query');
    return PaginatedResponse.fromJson(resp.data, (json) => CustomerSegmentModel.fromJson(json));
  }

  // ── Intelligence ────────────────────────────────────────────

  Future<Map<String, dynamic>> getTrendingDestinations() async {
    final resp = await _api.get(ApiEndpoints.biTrendingDestinations);
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getLostDealAnalysis() async {
    final resp = await _api.get(ApiEndpoints.biLostDealAnalysis);
    return resp.data['data'] as Map<String, dynamic>;
  }

  Future<List<LeadSourceRoi>> getLeadSourceRoi() async {
    final resp = await _api.get(ApiEndpoints.biLeadSourceRoi);
    return (resp.data['data'] as List).map((e) => LeadSourceRoi.fromJson(e)).toList();
  }

  Future<Map<String, dynamic>> generateRecommendations() async {
    final resp = await _api.post(ApiEndpoints.biRecommendationsGenerate);
    return resp.data['data'] as Map<String, dynamic>;
  }

  // ── Metering ────────────────────────────────────────────────

  Future<BiUsageSummary> getUsage({String period = '30d'}) async {
    final resp = await _api.get('${ApiEndpoints.biUsage}?period=$period');
    return BiUsageSummary.fromJson(resp.data['data']);
  }

  Future<RevenuePulse> getRevenuePulse() async {
    final resp = await _api.get(ApiEndpoints.biRevenuePulse);
    return RevenuePulse.fromJson(resp.data['data']);
  }
}
