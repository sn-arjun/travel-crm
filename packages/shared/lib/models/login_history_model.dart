import 'package:freezed_annotation/freezed_annotation.dart';

part 'login_history_model.freezed.dart';
part 'login_history_model.g.dart';

@freezed
abstract class LoginHistoryModel with _$LoginHistoryModel {
  const factory LoginHistoryModel({
    required String id,
    String? userId,
    String? ipAddress,
    String? country,
    String? city,
    String? browser,
    String? os,
    String? device,
    @Default('success') String status,
    String? failureReason,
    String? createdAt,
  }) = _LoginHistoryModel;

  factory LoginHistoryModel.fromJson(Map<String, dynamic> json) =>
      _$LoginHistoryModelFromJson(json);
}
