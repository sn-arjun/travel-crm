import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  return AiRepository(ref.watch(apiClientProvider));
});

class AiRepository {
  final ApiClient _api;
  AiRepository(this._api);

  // ── Conversations ──────────────────────────────────────────

  Future<PaginatedResponse<AiConversationModel>> getConversations({
    int page = 1,
    int limit = 20,
    String? feature,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'feature': ?feature,
    };
    final response = await _api.get(ApiEndpoints.aiConversations,
        queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => AiConversationModel.fromJson(json),
    );
  }

  Future<AiConversationModel> getConversation(String id) async {
    final response = await _api.get(ApiEndpoints.aiConversation(id));
    return AiConversationModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteConversation(String id) async {
    await _api.delete(ApiEndpoints.aiConversation(id));
  }

  // ── Lead Extraction ─────────────────────────────────────

  Future<AiLeadExtractionResult> extractLead({
    required String text,
    String? source,
  }) async {
    final response = await _api.post(ApiEndpoints.aiExtractLead, data: {
      'text': text,
      'source': ?source,
    });
    return AiLeadExtractionResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<AiLeadExtractionResult> parseWhatsapp(String message) async {
    final response = await _api
        .post(ApiEndpoints.aiParseWhatsapp, data: {'message': message});
    return AiLeadExtractionResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<AiLeadExtractionResult> parseEmail(String email,
      {String? subject}) async {
    final response = await _api.post(ApiEndpoints.aiParseEmail, data: {
      'email': email,
      'subject': ?subject,
    });
    return AiLeadExtractionResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<AiLeadExtractionResult> scanBusinessCard({
    required String imageBase64,
    String mimeType = 'image/jpeg',
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiScanBusinessCard, data: {
      'image': imageBase64,
      'mimeType': mimeType,
    });
    return AiLeadExtractionResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> parseBulkLeads(String text) async {
    final response =
        await _api.post(ApiEndpoints.aiParseBulkLeads, data: {'text': text});
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Itinerary Generation ──────────────────────────────────

  Future<AiItineraryResult> generateItinerary({
    required String prompt,
    String? destination,
    int? duration,
    double? budget,
    String? budgetCurrency,
    int? paxCount,
    String? tripType,
    List<String>? preferences,
    String? leadId,
    String? conversationId,
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiGenerateItinerary, data: {
      'prompt': prompt,
      'destination': ?destination,
      'duration': ?duration,
      'budget': ?budget,
      'budgetCurrency': ?budgetCurrency,
      'paxCount': ?paxCount,
      'tripType': ?tripType,
      'preferences': ?preferences,
      'leadId': ?leadId,
      'conversationId': ?conversationId,
    });
    return AiItineraryResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> enrichItinerary(
    Map<String, dynamic> itinerary, {
    List<String>? enrichments,
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiEnrichItinerary, data: {
      'itinerary': itinerary,
      'enrichments': ?enrichments,
    });
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Invoice Generation ────────────────────────────────────

  Future<AiInvoiceResult> generateInvoice({
    required Map<String, dynamic> itinerary,
    String currency = 'INR',
    double gstRate = 5,
    double tcsRate = 5,
    double markupPercent = 15,
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiGenerateInvoice, data: {
      'itinerary': itinerary,
      'currency': currency,
      'gstRate': gstRate,
      'tcsRate': tcsRate,
      'markupPercent': markupPercent,
    });
    return AiInvoiceResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  // ── Communication Composer ────────────────────────────────

  Future<AiMessageResult> composeMessage({
    required String channel,
    required String purpose,
    String tone = 'professional',
    String language = 'en',
    Map<String, dynamic>? context,
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiComposeMessage, data: {
      'channel': channel,
      'purpose': purpose,
      'tone': tone,
      'language': language,
      'context': ?context,
    });
    return AiMessageResult.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<List<String>> suggestReplies({
    required String incomingMessage,
    required String channel,
    String? customerName,
  }) async {
    final response =
        await _api.post(ApiEndpoints.aiSuggestReplies, data: {
      'incomingMessage': incomingMessage,
      'channel': channel,
      'customerName': ?customerName,
    });
    final data = response.data['data'];
    return (data['suggestions'] as List).cast<String>();
  }

  // ── Generated Content ────────────────────────────────────

  Future<PaginatedResponse<AiGeneratedContentModel>> getGeneratedContent({
    int page = 1,
    int limit = 20,
    String? contentType,
    String? status,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'contentType': ?contentType,
      'status': ?status,
    };
    final response =
        await _api.get(ApiEndpoints.aiGenerated, queryParameters: params);
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => AiGeneratedContentModel.fromJson(json),
    );
  }

  Future<AiGeneratedContentModel> getGeneratedItem(String id) async {
    final response = await _api.get(ApiEndpoints.aiGeneratedItem(id));
    return AiGeneratedContentModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> feedbackGenerated(String id,
      {required String feedback, String? notes}) async {
    await _api.post(ApiEndpoints.aiGeneratedFeedback(id), data: {
      'feedback': feedback,
      'notes': ?notes,
    });
  }

  Future<void> acceptGenerated(String id) async {
    await _api.post(ApiEndpoints.aiGeneratedAccept(id));
  }

  Future<void> rejectGenerated(String id) async {
    await _api.post(ApiEndpoints.aiGeneratedReject(id));
  }
}
