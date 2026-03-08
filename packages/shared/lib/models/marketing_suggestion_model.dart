import 'package:freezed_annotation/freezed_annotation.dart';

part 'marketing_suggestion_model.freezed.dart';
part 'marketing_suggestion_model.g.dart';

@freezed
abstract class MarketingSuggestionModel with _$MarketingSuggestionModel {
  const factory MarketingSuggestionModel({
    required String id,
    required String suggestionType,
    required String title,
    required String description,
    Map<String, dynamic>? details,
    @Default('medium') String priority,
    @Default('pending') String status,
    String? targetSegment,
    String? estimatedImpact,
    String? basis,
    String? modelUsed,
    @Default(0) int tokensUsed,
    @Default(0) double costEstimate,
    String? createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
  }) = _MarketingSuggestionModel;

  factory MarketingSuggestionModel.fromJson(Map<String, dynamic> json) =>
      _$MarketingSuggestionModelFromJson(json);
}
