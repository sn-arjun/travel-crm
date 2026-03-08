import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';

final chatbotRepositoryProvider = Provider<ChatbotRepository>((ref) {
  return ChatbotRepository(ref.watch(apiClientProvider));
});

class ChatbotRepository {
  final ApiClient _api;
  ChatbotRepository(this._api);

  // ── Config ──────────────────────────────────────────────────

  Future<List<ChatbotConfigModel>> getConfigs() async {
    final resp = await _api.get(ApiEndpoints.chatbotConfigs);
    return (resp.data['data'] as List).map((e) => ChatbotConfigModel.fromJson(e)).toList();
  }

  Future<ChatbotConfigModel> getConfig(String channel) async {
    final resp = await _api.get(ApiEndpoints.chatbotConfig(channel));
    return ChatbotConfigModel.fromJson(resp.data['data']);
  }

  Future<ChatbotConfigModel> updateConfig(String channel, Map<String, dynamic> data) async {
    final resp = await _api.put(ApiEndpoints.chatbotConfig(channel), data: data);
    return ChatbotConfigModel.fromJson(resp.data['data']);
  }

  // ── Conversations ───────────────────────────────────────────

  Future<PaginatedResponse<ChatbotConversationModel>> getConversations({String? channel, String? status, int limit = 20, int offset = 0}) async {
    final params = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (channel != null) params['channel'] = channel;
    if (status != null) params['status'] = status;
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    final resp = await _api.get('${ApiEndpoints.chatbotConversations}?$query');
    return PaginatedResponse.fromJson(
      resp.data,
      (json) => ChatbotConversationModel.fromJson(json),
    );
  }

  Future<ChatbotConversationModel> getConversation(String id) async {
    final resp = await _api.get(ApiEndpoints.chatbotConversation(id));
    return ChatbotConversationModel.fromJson(resp.data['data']);
  }

  Future<void> replyToConversation(String id, String message) async {
    await _api.post(ApiEndpoints.chatbotConversationReply(id), data: {'message': message});
  }

  Future<void> handoffConversation(String id) async {
    await _api.post(ApiEndpoints.chatbotConversationHandoff(id));
  }

  Future<void> closeConversation(String id) async {
    await _api.post(ApiEndpoints.chatbotConversationClose(id));
  }

  Future<String> createLeadFromConversation(String id) async {
    final resp = await _api.post(ApiEndpoints.chatbotConversationCreateLead(id));
    return resp.data['data']['leadId'];
  }

  // ── Analytics ───────────────────────────────────────────────

  Future<ChatbotAnalytics> getAnalytics({String period = '30d'}) async {
    final resp = await _api.get('${ApiEndpoints.chatbotAnalytics}?period=$period');
    return ChatbotAnalytics.fromJson(resp.data['data']);
  }
}
