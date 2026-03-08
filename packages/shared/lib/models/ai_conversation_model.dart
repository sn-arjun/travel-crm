import 'package:freezed_annotation/freezed_annotation.dart';

part 'ai_conversation_model.freezed.dart';
part 'ai_conversation_model.g.dart';

@freezed
abstract class AiConversationModel with _$AiConversationModel {
  const factory AiConversationModel({
    required String id,
    String? title,
    required String feature,
    String? entityType,
    String? entityId,
    @Default([]) List<AiMessage> messages,
    String? modelUsed,
    @Default(true) bool isActive,
    int? totalInputTokens,
    int? totalOutputTokens,
    double? totalCost,
    String? createdAt,
    String? updatedAt,
  }) = _AiConversationModel;

  factory AiConversationModel.fromJson(Map<String, dynamic> json) =>
      _$AiConversationModelFromJson(json);
}

@freezed
abstract class AiMessage with _$AiMessage {
  const factory AiMessage({
    required String role,
    required String content,
    String? timestamp,
  }) = _AiMessage;

  factory AiMessage.fromJson(Map<String, dynamic> json) =>
      _$AiMessageFromJson(json);
}

@freezed
abstract class AiGeneratedContentModel with _$AiGeneratedContentModel {
  const factory AiGeneratedContentModel({
    required String id,
    String? conversationId,
    required String contentType,
    String? prompt,
    String? rawOutput,
    Map<String, dynamic>? structuredOutput,
    String? entityType,
    String? entityId,
    @Default('draft') String status,
    String? feedback,
    String? feedbackNotes,
    String? modelUsed,
    int? inputTokens,
    int? outputTokens,
    double? costEstimate,
    int? durationMs,
    String? createdAt,
  }) = _AiGeneratedContentModel;

  factory AiGeneratedContentModel.fromJson(Map<String, dynamic> json) =>
      _$AiGeneratedContentModelFromJson(json);
}

@freezed
abstract class AiLeadExtractionResult with _$AiLeadExtractionResult {
  const factory AiLeadExtractionResult({
    required String contentId,
    required Map<String, dynamic> extracted,
    @Default('freeform') String source,
    String? model,
    double? cost,
  }) = _AiLeadExtractionResult;

  factory AiLeadExtractionResult.fromJson(Map<String, dynamic> json) =>
      _$AiLeadExtractionResultFromJson(json);
}

@freezed
abstract class AiItineraryResult with _$AiItineraryResult {
  const factory AiItineraryResult({
    required String contentId,
    required String conversationId,
    required Map<String, dynamic> itinerary,
    String? model,
    double? cost,
  }) = _AiItineraryResult;

  factory AiItineraryResult.fromJson(Map<String, dynamic> json) =>
      _$AiItineraryResultFromJson(json);
}

@freezed
abstract class AiInvoiceResult with _$AiInvoiceResult {
  const factory AiInvoiceResult({
    required String contentId,
    required Map<String, dynamic> invoice,
    String? model,
    double? cost,
  }) = _AiInvoiceResult;

  factory AiInvoiceResult.fromJson(Map<String, dynamic> json) =>
      _$AiInvoiceResultFromJson(json);
}

@freezed
abstract class AiMessageResult with _$AiMessageResult {
  const factory AiMessageResult({
    required String contentId,
    required Map<String, dynamic> message,
    required String channel,
    String? model,
    double? cost,
  }) = _AiMessageResult;

  factory AiMessageResult.fromJson(Map<String, dynamic> json) =>
      _$AiMessageResultFromJson(json);
}
