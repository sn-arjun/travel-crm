import 'package:freezed_annotation/freezed_annotation.dart';

part 'traveller.freezed.dart';
part 'traveller.g.dart';

@freezed
abstract class Traveller with _$Traveller {
  const factory Traveller({
    required String id,
    @JsonKey(name: 'contact_id') String? contactId,
    @JsonKey(name: 'first_name') required String firstName,
    @JsonKey(name: 'last_name') required String lastName,
    @JsonKey(name: 'full_name_passport') required String fullNamePassport,
    @JsonKey(name: 'date_of_birth') String? dateOfBirth,
    String? gender,
    String? nationality,
    @JsonKey(name: 'passport_number') String? passportNumber,
    @JsonKey(name: 'passport_issue_date') String? passportIssueDate,
    @JsonKey(name: 'passport_expiry_date') String? passportExpiryDate,
    @JsonKey(name: 'passport_issuing_country') String? passportIssuingCountry,
    @JsonKey(name: 'frequent_flyer_numbers') String? frequentFlyerNumbers,
    @JsonKey(name: 'meal_preference') String? mealPreference,
    @JsonKey(name: 'seat_preference') String? seatPreference,
    @JsonKey(name: 'room_preference') String? roomPreference,
    @JsonKey(name: 'medical_notes') String? medicalNotes,
    @JsonKey(name: 'emergency_contact_name') String? emergencyContactName,
    @JsonKey(name: 'emergency_contact_phone') String? emergencyContactPhone,
    @JsonKey(name: 'emergency_contact_relationship') String? emergencyContactRelationship,
    @JsonKey(name: 'profile_photo_url') String? profilePhotoUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) = _Traveller;

  factory Traveller.fromJson(Map<String, dynamic> json) => _$TravellerFromJson(json);
}
