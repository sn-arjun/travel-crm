import 'package:freezed_annotation/freezed_annotation.dart';

part 'itinerary_template_model.freezed.dart';
part 'itinerary_template_model.g.dart';

// ── Helper: backend stores booleans as INTEGER (0/1) ─────────
bool _intOrBoolToBool(dynamic value) {
  if (value is bool) return value;
  if (value is int) return value != 0;
  return false;
}

// ── ItineraryTemplateModel ───────────────────────────────────

@freezed
abstract class ItineraryTemplateModel with _$ItineraryTemplateModel {
  const factory ItineraryTemplateModel({
    required String id,
    required String title,
    String? description,
    String? destination,
    int? durationDays,
    String? category,
    Map<String, dynamic>? templateData,
    @JsonKey(fromJson: _intOrBoolToBool) @Default(false) bool isSystem,
    String? createdBy,
    String? createdAt,
    String? updatedAt,
  }) = _ItineraryTemplateModel;

  factory ItineraryTemplateModel.fromJson(Map<String, dynamic> json) =>
      _$ItineraryTemplateModelFromJson(json);
}
