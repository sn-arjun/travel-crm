import 'dart:io';

import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class ImportRepository {
  final ApiClient _apiClient;

  ImportRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // Upload an file to initiate an import job
  Future<ImportJobModel> uploadFile(File file, String importType) async {
    final formData = FormData.fromMap({
      'type': importType,
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.path.split('/').last,
      ),
    });

    final response = await _apiClient.upload(
      ApiEndpoints.importsUpload,
      data: formData,
    );
    
    return ImportJobModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // Get recent import jobs (History)
  Future<List<ImportJobModel>> getImportJobs({int limit = 20, int offset = 0}) async {
    final response = await _apiClient.get(
      ApiEndpoints.imports,
      queryParameters: {
        'limit': limit,
        'offset': offset,
      },
    );
    
    final list = response.data['data'] as List;
    return list
        .map((e) => ImportJobModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // Get progress for a specific job
  Future<ImportJobModel> getImportProgress(String jobId) async {
    final response = await _apiClient.get(ApiEndpoints.importProgress(jobId));
    return ImportJobModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // Execute an import job with mapping and duplicate strategy
  Future<void> executeImport(
    String jobId, {
    required Map<String, String> columnMapping,
    required String duplicateStrategy,
  }) async {
    await _apiClient.post(
      ApiEndpoints.importExecute(jobId),
      data: {
        'mapping': columnMapping,
        'duplicateStrategy': duplicateStrategy,
      },
    );
  }

  // Get a list of errors for a specific job
  Future<List<ImportErrorModel>> getImportErrors(String jobId) async {
    final response = await _apiClient.get(ApiEndpoints.importErrors(jobId));
    
    final list = response.data['data'] as List;
    return list
        .map((e) => ImportErrorModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // You would trigger a download via url launcher typically, but this is the endpoint:
  String getErrorDownloadUrl(String jobId) {
    return '${AppConstants.apiBaseUrl}${ApiEndpoints.importErrorsDownload(jobId)}';
  }

  String getTemplateDownloadUrl(String type) {
    return '${AppConstants.apiBaseUrl}${ApiEndpoints.importTemplate(type)}';
  }
}
