import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class DocumentRepository {
  final ApiClient _apiClient;

  DocumentRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<Map<String, dynamic>> getDocuments({
    String? entityType,
    String? entityId,
    String? category,
    int page = 1,
    int limit = 50,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'entity_type': ?entityType,
      'entity_id': ?entityId,
      'category': ?category,
    };

    final response = await _apiClient.get(
      ApiEndpoints.documents,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  Future<DocumentModel> getDocument(String id) async {
    final response = await _apiClient.get(ApiEndpoints.document(id));
    return DocumentModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<DocumentModel> uploadDocument({
    required String fileName,
    required Uint8List fileBytes,
    required String mimeType,
    String entityType = 'general',
    String? entityId,
    String category = 'other',
    String? description,
  }) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(fileBytes, filename: fileName),
      'entity_type': entityType,
      'entity_id': ?entityId,
      'category': category,
      'description': ?description,
    });

    final response = await _apiClient.post(
      ApiEndpoints.documentUpload,
      data: formData,
    );
    return DocumentModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> updateDocument(String id, Map<String, dynamic> data) async {
    await _apiClient.put(ApiEndpoints.document(id), data: data);
  }

  Future<void> deleteDocument(String id) async {
    await _apiClient.delete(ApiEndpoints.document(id));
  }

  String getDownloadUrl(String id) => ApiEndpoints.documentDownload(id);
}
