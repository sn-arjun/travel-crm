import 'package:freezed_annotation/freezed_annotation.dart';

part 'chatbot_model.freezed.dart';
part 'chatbot_model.g.dart';

@freezed
abstract class ChatbotConfigModel with _$ChatbotConfigModel {
  const factory ChatbotConfigModel({
    required String id,
    required String channel,
    @Default(true) bool enabled,
    String? greeting,
    String? businessHoursStart,
    String? businessHoursEnd,
    List<int>? businessDays,
    String? afterHoursMessage,
    List<Map<String, dynamic>>? qualificationQuestions,
    List<FaqEntry>? faqEntries,
    String? brandingColor,
    String? brandingLogo,
    @Default(10) int maxAutoReplies,
    @Default(5) int handoffThreshold,
    String? systemPrompt,
    String? createdAt,
    String? updatedAt,
  }) = _ChatbotConfigModel;

  factory ChatbotConfigModel.fromJson(Map<String, dynamic> json) =>
      _$ChatbotConfigModelFromJson(json);
}

@freezed
abstract class FaqEntry with _$FaqEntry {
  const factory FaqEntry({
    required String question,
    required String answer,
  }) = _FaqEntry;

  factory FaqEntry.fromJson(Map<String, dynamic> json) =>
      _$FaqEntryFromJson(json);
}

@freezed
abstract class ChatbotConversationModel with _$ChatbotConversationModel {
  const factory ChatbotConversationModel({
    required String id,
    required String channel,
    String? visitorId,
    String? visitorName,
    String? visitorEmail,
    String? visitorPhone,
    @Default('en') String language,
    List<ChatbotMessage>? messages,
    @Default('active') String status,
    String? assignedUserId,
    String? leadId,
    String? contactId,
    Map<String, dynamic>? qualificationData,
    String? sentiment,
    @Default(0) int messageCount,
    @Default(0) int botMessageCount,
    @Default(0) int humanMessageCount,
    @Default(0) int totalTokens,
    @Default(0) double totalCost,
    String? lastMessageAt,
    String? closedAt,
    String? createdAt,
    String? updatedAt,
  }) = _ChatbotConversationModel;

  factory ChatbotConversationModel.fromJson(Map<String, dynamic> json) =>
      _$ChatbotConversationModelFromJson(json);
}

@freezed
abstract class ChatbotMessage with _$ChatbotMessage {
  const factory ChatbotMessage({
    required String role,
    required String content,
    String? timestamp,
    String? agentId,
  }) = _ChatbotMessage;

  factory ChatbotMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatbotMessageFromJson(json);
}

@freezed
abstract class ChatbotAnalytics with _$ChatbotAnalytics {
  const factory ChatbotAnalytics({
    @Default(0) int totalConversations,
    List<Map<String, dynamic>>? byChannel,
    List<Map<String, dynamic>>? byStatus,
    @Default(0) int handoffCount,
    @Default(0) int qualifiedCount,
    @Default(0) int avgMessagesPerConversation,
    @Default(0) double totalAiCost,
    @Default('0.0') String handoffRate,
  }) = _ChatbotAnalytics;

  factory ChatbotAnalytics.fromJson(Map<String, dynamic> json) =>
      _$ChatbotAnalyticsFromJson(json);
}
