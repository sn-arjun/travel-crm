import 'package:freezed_annotation/freezed_annotation.dart';

part 'contact_segment_model.freezed.dart';
part 'contact_segment_model.g.dart';

@freezed
abstract class ContactSegmentModel with _$ContactSegmentModel {
  const factory ContactSegmentModel({
    required String id,
    String? tenantId,
    required String name,
    String? description,
    String? filtersJson,
    @Default(0) int contactCount,
    @Default(true) bool isDynamic,
    @Default(false) bool isDeleted,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _ContactSegmentModel;

  factory ContactSegmentModel.fromJson(Map<String, dynamic> json) =>
      _$ContactSegmentModelFromJson(json);
}

@freezed
abstract class FilterGroup with _$FilterGroup {
  const factory FilterGroup({
    @Default('AND') String logic,
    @Default([]) List<FilterRule> rules,
  }) = _FilterGroup;

  factory FilterGroup.fromJson(Map<String, dynamic> json) =>
      _$FilterGroupFromJson(json);
}

@freezed
abstract class FilterRule with _$FilterRule {
  const factory FilterRule({
    required String field,
    required String operator,
    dynamic value,
  }) = _FilterRule;

  factory FilterRule.fromJson(Map<String, dynamic> json) =>
      _$FilterRuleFromJson(json);
}
