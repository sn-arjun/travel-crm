import 'package:freezed_annotation/freezed_annotation.dart';

part 'call_log_model.freezed.dart';
part 'call_log_model.g.dart';

@freezed
abstract class CallLogModel with _$CallLogModel {
  const factory CallLogModel({
    required String id,
    String? contactId,
    String? contactName,
    String? leadId,
    String? leadTitle,
    required String direction,
    required String fromNumber,
    required String toNumber,
    @Default(0) int durationSeconds,
    required String status,
    String? outcome,
    String? providerCallId,
    String? twilioCallSid,
    String? recordingUrl,
    String? recordingR2Key,
    int? recordingDuration,
    String? notes,
    List<String>? ivrPath,
    String? routedTo,
    String? answeredBy,
    required String createdBy,
    String? createdByName,
    String? createdAt,
    String? updatedAt,
  }) = _CallLogModel;

  factory CallLogModel.fromJson(Map<String, dynamic> json) =>
      _$CallLogModelFromJson(json);
}

@freezed
abstract class OutboundCallRequest with _$OutboundCallRequest {
  const factory OutboundCallRequest({
    required String toNumber,
    String? contactId,
    String? leadId,
  }) = _OutboundCallRequest;

  factory OutboundCallRequest.fromJson(Map<String, dynamic> json) =>
      _$OutboundCallRequestFromJson(json);
}

@freezed
abstract class OutboundCallResponse with _$OutboundCallResponse {
  const factory OutboundCallResponse({
    required String callLogId,
    String? providerCallId,
    @Deprecated('Use providerCallId') String? callSid,
    required String status,
  }) = _OutboundCallResponse;

  factory OutboundCallResponse.fromJson(Map<String, dynamic> json) =>
      _$OutboundCallResponseFromJson(json);
}
