import 'package:freezed_annotation/freezed_annotation.dart';

part 'visa_application.freezed.dart';
part 'visa_application.g.dart';

enum VisaType {
  @JsonValue('tourist')
  tourist,
  @JsonValue('business')
  business,
  @JsonValue('transit')
  transit,
  @JsonValue('student')
  student,
  @JsonValue('work')
  work,
  @JsonValue('medical')
  medical,
}

enum VisaStatus {
  @JsonValue('not_started')
  notStarted,
  @JsonValue('documents_collecting')
  documentsCollecting,
  @JsonValue('applied')
  applied,
  @JsonValue('processing')
  processing,
  @JsonValue('approved')
  approved,
  @JsonValue('rejected')
  rejected,
}

enum VisaEntryType {
  @JsonValue('single')
  single,
  @JsonValue('multiple')
  multiple,
  @JsonValue('transit')
  transit,
}

@freezed
abstract class VisaApplication with _$VisaApplication {
  const factory VisaApplication({
    required String id,
    @JsonKey(name: 'traveller_id') required String travellerId,
    @JsonKey(name: 'lead_id') String? leadId,
    @JsonKey(name: 'destination_country') required String destinationCountry,
    @JsonKey(name: 'visa_type') required VisaType visaType,
    @Default(VisaStatus.notStarted) VisaStatus status,
    @JsonKey(name: 'application_number') String? applicationNumber,
    @JsonKey(name: 'applied_date') String? appliedDate,
    @JsonKey(name: 'appointment_date') String? appointmentDate,
    @JsonKey(name: 'expected_date') String? expectedDate,
    @JsonKey(name: 'approved_date') String? approvedDate,
    @JsonKey(name: 'rejected_date') String? rejectedDate,
    @JsonKey(name: 'rejection_reason') String? rejectionReason,
    @JsonKey(name: 'visa_number') String? visaNumber,
    @JsonKey(name: 'visa_issue_date') String? visaIssueDate,
    @JsonKey(name: 'visa_expiry_date') String? visaExpiryDate,
    @JsonKey(name: 'visa_entry_type') VisaEntryType? visaEntryType,
    @JsonKey(name: 'embassy_name') String? embassyName,
    String? notes,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) = _VisaApplication;

  factory VisaApplication.fromJson(Map<String, dynamic> json) => _$VisaApplicationFromJson(json);
}
