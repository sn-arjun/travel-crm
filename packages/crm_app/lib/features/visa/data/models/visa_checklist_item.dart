import 'package:freezed_annotation/freezed_annotation.dart';

part 'visa_checklist_item.freezed.dart';
part 'visa_checklist_item.g.dart';

@freezed
abstract class VisaChecklistItem with _$VisaChecklistItem {
  const factory VisaChecklistItem({
    required String id,
    @JsonKey(name: 'visa_application_id') required String visaApplicationId,
    @JsonKey(name: 'document_name') required String documentName,
    String? description,
    @JsonKey(name: 'is_required') @Default(false) bool isRequired,
    @JsonKey(name: 'is_received') @Default(false) bool isReceived,
    @JsonKey(name: 'received_date') String? receivedDate,
    @JsonKey(name: 'received_by') String? receivedBy,
    @JsonKey(name: 'sort_order') @Default(0) int sortOrder,
    String? notes,
  }) = _VisaChecklistItem;

  factory VisaChecklistItem.fromJson(Map<String, dynamic> json) => _$VisaChecklistItemFromJson(json);
}

@freezed
abstract class VisaNote with _$VisaNote {
  const factory VisaNote({
    required String id,
    @JsonKey(name: 'visa_application_id') required String visaApplicationId,
    required String content,
    @JsonKey(name: 'created_by') String? createdBy,
    DateTime? createdAt,
  }) = _VisaNote;

  factory VisaNote.fromJson(Map<String, dynamic> json) => _$VisaNoteFromJson(json);
}
