import 'dart:typed_data';
import 'package:shared/shared.dart';
import 'package:dio/dio.dart';

class ImageLibraryRepository {
  final ApiClient _apiClient;

  ImageLibraryRepository(this._apiClient);

  Future<PaginatedResponse<ImageLibraryModel>> getImages({
    int page = 1,
    int limit = 20,
    String? category,
    String? search,
    String? tags,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.marketingImages,
      queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
        'category': ?category,
        'search': ?search,
        'tags': ?tags,
      },
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => ImageLibraryModel.fromJson(json),
    );
  }

  Future<ImageLibraryModel> uploadImage(
    Uint8List bytes,
    String filename,
  ) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final response = await _apiClient.post(
      ApiEndpoints.marketingImageUpload,
      data: formData,
    );
    return ImageLibraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ImageLibraryModel> uploadLogo(Uint8List bytes, String filename) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final response = await _apiClient.post(
      ApiEndpoints.marketingLogoUpload,
      data: formData,
    );
    return ImageLibraryModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteImage(String id) async {
    await _apiClient.delete(ApiEndpoints.marketingImage(id));
  }
}
