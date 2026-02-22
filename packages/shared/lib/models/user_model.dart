import 'package:freezed_annotation/freezed_annotation.dart';

part 'user_model.freezed.dart';
part 'user_model.g.dart';

@freezed
abstract class UserModel with _$UserModel {
  const factory UserModel({
    required String id,
    required String email,
    String? phone,
    required String name,
    required String role,
    String? avatarUrl,
    String? department,
    @Default('en') String language,
    String? inviteStatus,
    @JsonKey(fromJson: _intOrBoolToBool)
    @Default(true) bool isActive,
    String? lastLoginAt,
    String? createdAt,
    String? updatedAt,
  }) = _UserModel;

  factory UserModel.fromJson(Map<String, dynamic> json) =>
      _$UserModelFromJson(json);
}

bool _intOrBoolToBool(dynamic value) {
  if (value is bool) return value;
  if (value is int) return value != 0;
  return true;
}
