import 'dart:typed_data';
import 'package:shared/shared.dart';
import 'package:dio/dio.dart';

class FlyerRepository {
  final ApiClient _apiClient;

  FlyerRepository(this._apiClient);

  Future<PaginatedResponse<GeneratedFlyerModel>> getFlyers({
    int page = 1,
    int limit = 20,
    String? search,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingFlyers,
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'search': ?search,
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => GeneratedFlyerModel.fromJson(json),
    );
  }

  Future<GeneratedFlyerModel> getFlyer(String id) async {
    final response = await _apiClient.get(ApiEndpoints.marketingFlyer(id));
    return GeneratedFlyerModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<GeneratedFlyerModel> saveFlyer(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.marketingFlyers,
      data: data,
    );
    return GeneratedFlyerModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<GeneratedFlyerModel> uploadFlyerImage(
    String flyerId,
    Uint8List bytes,
    String filename,
  ) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final response = await _apiClient.post(
      ApiEndpoints.marketingFlyerUpload(flyerId),
      data: formData,
    );
    return GeneratedFlyerModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> shareFlyer({
    required String flyerId,
    required String channel,
    String? recipientInfo,
  }) async {
    await _apiClient.post(
      ApiEndpoints.marketingFlyerShare,
      data: {
        'flyerId': flyerId,
        'channel': channel,
        'recipientInfo': ?recipientInfo,
      },
    );
  }

  Future<void> deleteFlyer(String id) async {
    await _apiClient.delete(ApiEndpoints.marketingFlyer(id));
  }
}
