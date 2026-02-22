import 'package:freezed_annotation/freezed_annotation.dart';

part 'session_model.freezed.dart';
part 'session_model.g.dart';

@freezed
abstract class SessionModel with _$SessionModel {
  const factory SessionModel({
    required String id,
    @Default('Unknown') String device,
    @Default('Unknown') String browser,
    @Default('Unknown') String os,
    String? ipAddress,
    String? city,
    String? country,
    @Default('') String loginAt,
    @Default(false) bool isCurrent,
  }) = _SessionModel;

  factory SessionModel.fromJson(Map<String, dynamic> json) =>
      _$SessionModelFromJson(json);
}
