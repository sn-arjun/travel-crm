import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class ProfileRepository {
  final Dio _dio;

  ProfileRepository(this._dio);

  Future<Map<String, dynamic>> getProfile() async {
    final response = await _dio.get(ApiEndpoints.driverProfile);
    return response.data;
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

  Future<Map<String, dynamic>> uploadDocument({
    required String type,
    required String base64File,
    String? expiryDate,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.driverProfileDocuments,
      data: {
        'type': type,
        'file': base64File,
        'expiryDate': ?expiryDate,
      },
    );
    return response.data;
  }
}
