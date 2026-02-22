import 'package:freezed_annotation/freezed_annotation.dart';

part 'follow_up_model.freezed.dart';
part 'follow_up_model.g.dart';

@freezed
abstract class FollowUpModel with _$FollowUpModel {
  const factory FollowUpModel({
    required String id,
    required String leadId,
    String? leadTitle,
    String? contactName,
    required String scheduledAt,
    required String type, // call, email, whatsapp, visit
    String? notes,
    String? outcome,
    @Default('pending') String status, // pending, completed, missed
    String? completedAt,
    String? outcomeNotes,
    String? createdBy,
    String? createdByName,
    String? createdAt,
  }) = _FollowUpModel;

  factory FollowUpModel.fromJson(Map<String, dynamic> json) =>
      _$FollowUpModelFromJson(json);
}
