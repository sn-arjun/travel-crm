import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class ProfileRepository {
  final Dio _dio;

  ProfileRepository(this._dio);

  Future<Map<String, dynamic>> getProfile() async {
    final response = await _dio.get(ApiEndpoints.driverProfile);
    return response.data;
  }

  /// The crew role in a profile payload: `driver`, `tour_leader` or `both`.
  /// Reads `crewRole`, then `crew_role`; an older server sends neither, and
  /// the person is then a plain driver.
  static String crewRoleOf(Map<String, dynamic>? profile) {
    final v = profile?['crewRole'] ?? profile?['crew_role'];
    return v is String && v.isNotEmpty ? v : 'driver';
  }

  /// True for `tour_leader` and `both`.
  static bool isTourLeaderRole(String? role) =>
      role == 'tour_leader' || role == 'both';

  /// Reads the crew role from the profile endpoint.
  Future<String> getCrewRole() async {
    final response = await getProfile();
    final data = response['data'];
    return crewRoleOf(data is Map ? Map<String, dynamic>.from(data) : null);
  }

  Future<Map<String, dynamic>> updateProfile(
      Map<String, dynamic> data) async {
    final response = await _dio.put(ApiEndpoints.driverProfile, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> uploadPhoto(String base64Photo) async {
    final response = await _dio.post(
      ApiEndpoints.driverProfilePhoto,
      data: {'photo': base64Photo},
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getDocuments() async {
    final response = await _dio.get(ApiEndpoints.driverProfileDocuments);
    return response.data;
  }

  /// Uploads a document with the multipart fields the backend expects:
  /// `file`, `type` (license | id_proof | police_verification) and the optional
  /// `documentNumber`, `expiryDate` and `issuedDate`.
  Future<Map<String, dynamic>> uploadDocument({
    required String type,
    required String filePath,
    required String fileName,
    String? documentNumber,
    String? expiryDate,
    String? issuedDate,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'type': type,
      'file': await MultipartFile.fromFile(filePath, filename: fileName),
      'documentNumber': ?documentNumber,
      'expiryDate': ?expiryDate,
      'issuedDate': ?issuedDate,
    });
    final response = await _dio.post(
      ApiEndpoints.driverProfileDocuments,
      data: form,
      options: Options(contentType: 'multipart/form-data'),
      onSendProgress: onProgress,
    );
    return response.data;
  }
}
