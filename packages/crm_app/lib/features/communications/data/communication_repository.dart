import 'package:shared/shared.dart';

class CommunicationRepository {
  final ApiClient _apiClient;

  CommunicationRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── Send Message ──────────────────────────────────────────────
  Future<Map<String, dynamic>> sendMessage({
    required String channel,
    required String contactId,
    String? leadId,
    required String message,
    String? mediaUrl,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.sendMessage,
      data: {
        'channel': channel,
        'contactId': contactId,
        'leadId': ?leadId,
        'message': message,
        'mediaUrl': ?mediaUrl,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Send Template ─────────────────────────────────────────────
  Future<Map<String, dynamic>> sendTemplate({
    required String contactId,
    required String templateId,
    Map<String, String>? variables,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.messageTemplates}/$templateId/send',
      data: {
        'contactId': contactId,
        'variables': ?variables,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Send Document ─────────────────────────────────────────────
  Future<Map<String, dynamic>> sendDocument({
    required String contactId,
    required String channel,
    required String documentType,
    required String documentId,
    String? caption,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.sendMessage}/document',
      data: {
        'contactId': contactId,
        'channel': channel,
        'documentType': documentType,
        'documentId': documentId,
        'caption': ?caption,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Bulk Send ─────────────────────────────────────────────────
  Future<Map<String, dynamic>> bulkSend({
    required String channel,
    String? templateId,
    String? message,
    required List<String> contactIds,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.bulkSend,
      data: {
        'channel': channel,
        'templateId': ?templateId,
        'message': ?message,
        'contactIds': contactIds,
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Get Bulk Send Status ──────────────────────────────────────
  Future<Map<String, dynamic>> getBulkSendStatus(String batchId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.bulkSend}/$batchId/status',
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Get Message History ───────────────────────────────────────
  Future<Map<String, dynamic>> getHistory({
    required String contactId,
    String? channel,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'channel': ?channel,
    };

    final response = await _apiClient.get(
      ApiEndpoints.contactHistory(contactId),
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  // ── Get Communication Log ──────────────────────────────────────
  Future<Map<String, dynamic>> getLog({
    Map<String, dynamic>? filters,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (filters != null) ...filters,
    };

    final response = await _apiClient.get(
      ApiEndpoints.communicationLog,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }
}
