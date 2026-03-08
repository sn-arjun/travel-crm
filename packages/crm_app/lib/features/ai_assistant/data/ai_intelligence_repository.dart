import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';

final aiIntelligenceRepositoryProvider = Provider<AiIntelligenceRepository>((ref) {
  return AiIntelligenceRepository(ref.watch(apiClientProvider));
});

class AiIntelligenceRepository {
  final ApiClient _api;
  AiIntelligenceRepository(this._api);

  // ── NL Query ──────────────────────────────────────────────

  Future<AiNlQueryModel> nlQuery(String query, {String? conversationId}) async {
    final resp = await _api.post(ApiEndpoints.aiNlQuery, data: {
      'query': query,
      'conversationId': ?conversationId,
    });
    return AiNlQueryModel.fromJson(resp.data['data']);
  }

  Future<List<AiNlQueryModel>> getNlQueryHistory({int limit = 20, int offset = 0}) async {
    final resp = await _api.get('${ApiEndpoints.aiNlQueries}?limit=$limit&offset=$offset');
    return (resp.data['data'] as List).map((e) => AiNlQueryModel.fromJson(e)).toList();
  }

  // ── Insights ──────────────────────────────────────────────

  Future<List<AiInsightModel>> getInsights({String? type, String? priority, int limit = 20, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (type != null) params['type'] = type;
    if (priority != null) params['priority'] = priority;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.aiInsights}?$query');
    return (resp.data['data'] as List).map((e) => AiInsightModel.fromJson(e)).toList();
  }

  Future<AiInsightModel> getInsight(String id) async {
    final resp = await _api.get(ApiEndpoints.aiInsight(id));
    return AiInsightModel.fromJson(resp.data['data']);
  }

  Future<void> dismissInsight(String id) async {
    await _api.post(ApiEndpoints.aiInsightDismiss(id));
  }

  Future<void> actionInsight(String id) async {
    await _api.post(ApiEndpoints.aiInsightAction(id));
  }

  Future<CustomerInsightResult> getCustomerInsight(String contactId) async {
    final resp = await _api.post(ApiEndpoints.aiCustomerInsight(contactId));
    return CustomerInsightResult.fromJson(resp.data['data']);
  }

  Future<Map<String, dynamic>> generatePredictions() async {
    final resp = await _api.post(ApiEndpoints.aiPredictions);
    return resp.data['data'];
  }

  Future<TrendDetectionResult> detectTrends() async {
    final resp = await _api.post(ApiEndpoints.aiTrends);
    return TrendDetectionResult.fromJson(resp.data['data']);
  }

  // ── Recommendations ───────────────────────────────────────

  Future<List<AiRecommendationModel>> getRecommendations({String? type, String status = 'active', int limit = 20, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset', 'status': status};
    if (type != null) params['type'] = type;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.aiRecommendations}?$query');
    return (resp.data['data'] as List).map((e) => AiRecommendationModel.fromJson(e)).toList();
  }

  Future<void> dismissRecommendation(String id) async {
    await _api.post(ApiEndpoints.aiRecommendationDismiss(id));
  }

  Future<void> actOnRecommendation(String id) async {
    await _api.post(ApiEndpoints.aiRecommendationAct(id));
  }

  // ── Lead Scoring ──────────────────────────────────────────

  Future<AiLeadScoreModel> calculateLeadScore(String leadId) async {
    final resp = await _api.post(ApiEndpoints.aiLeadScore(leadId));
    return AiLeadScoreModel.fromJson(resp.data['data']);
  }

  Future<AiLeadScoreModel?> getLeadScore(String leadId) async {
    final resp = await _api.get(ApiEndpoints.aiLeadScore(leadId));
    if (resp.data['data'] == null) return null;
    return AiLeadScoreModel.fromJson(resp.data['data']);
  }

  Future<List<AiLeadScoreModel>> getLeadScoreHistory(String leadId, {int limit = 10}) async {
    final resp = await _api.get('${ApiEndpoints.aiLeadScoreHistory(leadId)}?limit=$limit');
    return (resp.data['data'] as List).map((e) => AiLeadScoreModel.fromJson(e)).toList();
  }

  Future<List<AiLeadScoreModel>> bulkGetLeadScores(List<String> leadIds) async {
    final resp = await _api.post(ApiEndpoints.aiLeadScoresBulk, data: {'leadIds': leadIds});
    return (resp.data['data'] as List).map((e) => AiLeadScoreModel.fromJson(e)).toList();
  }

  // ── Document OCR ──────────────────────────────────────────

  Future<Map<String, dynamic>> scanPassport(String imageBase64, {String? imageUrl}) async {
    final resp = await _api.post(ApiEndpoints.aiOcrPassport, data: {
      'imageBase64': imageBase64,
      'imageUrl': ?imageUrl,
    });
    return resp.data['data'];
  }

  Future<List<dynamic>> classifyVisaDocuments(List<Map<String, String>> images) async {
    final resp = await _api.post(ApiEndpoints.aiOcrVisaClassify, data: {'images': images});
    return resp.data['data'];
  }

  Future<Map<String, dynamic>> scanSupplierInvoice(String imageBase64, {String? imageUrl}) async {
    final resp = await _api.post(ApiEndpoints.aiOcrSupplierInvoice, data: {
      'imageBase64': imageBase64,
      'imageUrl': ?imageUrl,
    });
    return resp.data['data'];
  }

  Future<List<AiDocumentScanModel>> getDocumentScans({String? type, String? status, int limit = 20, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (type != null) params['type'] = type;
    if (status != null) params['status'] = status;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.aiDocumentScans}?$query');
    return (resp.data['data'] as List).map((e) => AiDocumentScanModel.fromJson(e)).toList();
  }

  Future<AiDocumentScanModel> getDocumentScan(String id) async {
    final resp = await _api.get(ApiEndpoints.aiDocumentScan(id));
    return AiDocumentScanModel.fromJson(resp.data['data']);
  }

  Future<void> applyDocumentScan(String id, {String? entityId}) async {
    await _api.post(ApiEndpoints.aiDocumentScanApply(id), data: {'entityId': entityId});
  }

  Future<void> rejectDocumentScan(String id) async {
    await _api.post(ApiEndpoints.aiDocumentScanReject(id));
  }

  // ── Smart Follow-ups ──────────────────────────────────────

  Future<AiFollowUpSuggestionModel> generateSmartFollowup(String leadId) async {
    final resp = await _api.post(ApiEndpoints.aiSmartFollowup(leadId));
    return AiFollowUpSuggestionModel.fromJson(resp.data['data']);
  }

  Future<List<AiFollowUpSuggestionModel>> getSmartFollowups({String status = 'pending', int limit = 20, int offset = 0}) async {
    final resp = await _api.get('${ApiEndpoints.aiSmartFollowups}?status=$status&limit=$limit&offset=$offset');
    return (resp.data['data'] as List).map((e) => AiFollowUpSuggestionModel.fromJson(e)).toList();
  }

  Future<void> sendFollowup(String id) async {
    await _api.post(ApiEndpoints.aiSmartFollowupSend(id));
  }

  Future<void> dismissFollowup(String id) async {
    await _api.post(ApiEndpoints.aiSmartFollowupDismiss(id));
  }
}
