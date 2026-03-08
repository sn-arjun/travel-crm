import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';

final voipRepositoryProvider = Provider<VoipRepository>((ref) {
  return VoipRepository(ref.watch(apiClientProvider));
});

class VoipRepository {
  final ApiClient _api;
  VoipRepository(this._api);

  // ── VoIP Settings ──────────────────────────────────────────

  Future<VoipSettingsModel> getSettings() async {
    final response = await _api.get(ApiEndpoints.voipSettings);
    return VoipSettingsModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> updateSettings(Map<String, dynamic> data) async {
    await _api.put(ApiEndpoints.voipSettings, data: data);
  }

  Future<VoipConnectionTestResult> testConnection() async {
    final response = await _api.get(ApiEndpoints.voipTestConnection);
    return VoipConnectionTestResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<VoipTokenResponse> getToken() async {
    final response = await _api.post(ApiEndpoints.voipToken);
    return VoipTokenResponse.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  // ── Call Logs ──────────────────────────────────────────────

  Future<PaginatedResponse<CallLogModel>> getCalls({
    int page = 1,
    int limit = 25,
    String? contactId,
    String? leadId,
    String? userId,
    String? direction,
    String? status,
    String? outcome,
    String? fromDate,
    String? toDate,
    String? search,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'contactId': ?contactId,
      'leadId': ?leadId,
      'userId': ?userId,
      'direction': ?direction,
      'status': ?status,
      'outcome': ?outcome,
      'fromDate': ?fromDate,
      'toDate': ?toDate,
      if (search != null && search.isNotEmpty) 'search': search,
    };
    final response =
        await _api.get(ApiEndpoints.calls, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => CallLogModel.fromJson(json),
    );
  }

  Future<CallLogModel> getCall(String id) async {
    final response = await _api.get(ApiEndpoints.call(id));
    return CallLogModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> updateCall(String id, Map<String, dynamic> data) async {
    await _api.put(ApiEndpoints.call(id), data: data);
  }

  Future<void> deleteCall(String id) async {
    await _api.delete(ApiEndpoints.call(id));
  }

  // ── Outbound Calling ───────────────────────────────────────

  Future<OutboundCallResponse> initiateCall({
    required String toNumber,
    String? contactId,
    String? leadId,
  }) async {
    final response = await _api.post(ApiEndpoints.callOutbound, data: {
      'toNumber': toNumber,
      'contactId': ?contactId,
      'leadId': ?leadId,
    });
    return OutboundCallResponse.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> transferCall(String id, String targetNumber) async {
    await _api.post(ApiEndpoints.callTransfer(id), data: {
      'targetNumber': targetNumber,
    });
  }

  Future<void> endCall(String id) async {
    await _api.post(ApiEndpoints.callEnd(id));
  }

  // ── Analytics ────────────────────────────────────────────────

  Future<CallAnalyticsModel> getAnalytics({
    String? fromDate,
    String? toDate,
  }) async {
    final params = <String, dynamic>{
      'fromDate': ?fromDate,
      'toDate': ?toDate,
    };
    final response = await _api.get(ApiEndpoints.callAnalytics,
        queryParameters: params);
    return CallAnalyticsModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  // ── Missed Calls ────────────────────────────────────────────

  Future<int> getMissedCallCount() async {
    final response = await _api.get(ApiEndpoints.callMissed);
    return (response.data['data']['count'] as num?)?.toInt() ?? 0;
  }

  Future<void> markMissedCallReturned(String id) async {
    await _api.post(ApiEndpoints.callMissedMarkReturned(id));
  }

  // ── Caller Info ─────────────────────────────────────────────

  Future<Map<String, dynamic>> getCallerInfo(String phone) async {
    final response = await _api.get(ApiEndpoints.voipCallerInfo,
        queryParameters: {'phone': phone});
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Twilio Numbers ──────────────────────────────────────────

  Future<List<TwilioNumberModel>> getNumbers() async {
    final response = await _api.get(ApiEndpoints.voipNumbers);
    final list = response.data['data'] as List;
    return list
        .map((e) => TwilioNumberModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<AvailableNumber>> searchNumbers({
    String? country,
    String? areaCode,
    String? contains,
  }) async {
    final response = await _api.post(ApiEndpoints.voipNumbersSearch, data: {
      'country': ?country,
      'areaCode': ?areaCode,
      'contains': ?contains,
    });
    final list = response.data['data'] as List;
    return list
        .map((e) => AvailableNumber.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> purchaseNumber({
    required String phoneNumber,
    String? friendlyName,
  }) async {
    final response = await _api.post(ApiEndpoints.voipNumbersPurchase, data: {
      'phoneNumber': phoneNumber,
      'friendlyName': ?friendlyName,
    });
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> updateNumber(String id, Map<String, dynamic> data) async {
    await _api.put(ApiEndpoints.voipNumber(id), data: data);
  }

  Future<void> deleteNumber(String id) async {
    await _api.delete(ApiEndpoints.voipNumber(id));
  }

  // ── Transcripts ──────────────────────────────────────────────

  Future<CallTranscriptModel> getTranscript(String callLogId) async {
    final response = await _api.get(ApiEndpoints.transcript(callLogId));
    return CallTranscriptModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> updateTranscript(
      String callLogId, String fullTranscript) async {
    await _api.put(ApiEndpoints.transcript(callLogId), data: {
      'fullTranscript': fullTranscript,
    });
  }

  Future<PaginatedResponse<TranscriptSearchResult>> searchTranscripts({
    required String query,
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _api.get(ApiEndpoints.transcripts,
        queryParameters: {'q': query, 'page': page, 'limit': limit});
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => TranscriptSearchResult.fromJson(json),
    );
  }

  // ── AI Extractions ──────────────────────────────────────────

  Future<PaginatedResponse<AiExtractionModel>> getExtractions({
    int page = 1,
    int limit = 20,
    String? status,
    String? sentiment,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'status': ?status,
      'sentiment': ?sentiment,
    };
    final response = await _api.get(ApiEndpoints.aiExtractions,
        queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => AiExtractionModel.fromJson(json),
    );
  }

  Future<int> getExtractionsPendingCount() async {
    final response = await _api.get(ApiEndpoints.aiExtractionsPendingCount);
    return (response.data['data']['count'] as num?)?.toInt() ?? 0;
  }

  Future<AiExtractionModel> getExtraction(String id) async {
    final response = await _api.get(ApiEndpoints.aiExtraction(id));
    return AiExtractionModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> confirmExtraction(
      String id, ExtractionConfirmRequest request) async {
    final response = await _api.post(ApiEndpoints.aiExtractionConfirm(id),
        data: request.toJson());
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> rejectExtraction(String id) async {
    await _api.post(ApiEndpoints.aiExtractionReject(id));
  }

  Future<AiUsageSummary> getAiUsageSummary({String period = '30d'}) async {
    final response = await _api.get(ApiEndpoints.aiUsageSummary,
        queryParameters: {'period': period});
    return AiUsageSummary.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  // ── Call Actions ──────────────────────────────────────────────

  Future<Map<String, dynamic>> getCallActions(String callId) async {
    final response = await _api.get(ApiEndpoints.callActions(callId));
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Extraction Actions ────────────────────────────────────────

  Future<Map<String, dynamic>> createItineraryFromExtraction(
    String extractionId, {
    String? notes,
  }) async {
    final response = await _api.post(
      ApiEndpoints.aiExtractionCreateItinerary(extractionId),
      data: {'notes': ?notes},
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createInvoiceFromExtraction(
    String extractionId,
  ) async {
    final response = await _api.post(
      ApiEndpoints.aiExtractionCreateInvoice(extractionId),
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> scheduleFollowupFromExtraction(
    String extractionId, {
    required String scheduledAt,
    String type = 'call',
    String? notes,
  }) async {
    final response = await _api.post(
      ApiEndpoints.aiExtractionScheduleFollowup(extractionId),
      data: {
        'scheduledAt': scheduledAt,
        'type': type,
        'notes': ?notes,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }
}
