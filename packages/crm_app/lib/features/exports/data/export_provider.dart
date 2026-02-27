import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../auth/data/auth_provider.dart';
import 'web_download_stub.dart'
    if (dart.library.js_interop) 'web_download_web.dart';

final exportProvider = Provider<ExportService>((ref) {
  return ExportService(apiClient: ref.read(apiClientProvider));
});

class ExportService {
  final ApiClient _apiClient;

  ExportService({required ApiClient apiClient}) : _apiClient = apiClient;

  // Sync Exports (download directly via authenticated API)
  Future<void> exportContacts({String format = 'xlsx'}) async {
    await _downloadFileViaApi(
      '${ApiEndpoints.exportsContacts}?format=$format',
      'contacts_export.xlsx',
    );
  }

  Future<void> exportLeads({String format = 'xlsx'}) async {
    await _downloadFileViaApi(
      '${ApiEndpoints.exportsLeads}?format=$format',
      'leads_export.xlsx',
    );
  }

  // Async Exports (Queue Jobs)
  Future<ExportJobModel> startBulkInvoicesExport(
      List<String> invoiceIds) async {
    final response = await _apiClient.post(
      ApiEndpoints.exportsInvoicesBulkPdf,
      data: {'invoiceIds': invoiceIds},
    );
    return ExportJobModel.fromJson(response.data['data']);
  }

  Future<ExportJobModel> startGdprExport() async {
    final response = await _apiClient.post(ApiEndpoints.exportsFull);
    return ExportJobModel.fromJson(response.data['data']);
  }

  Future<ExportJobModel> checkExportJob(String jobId) async {
    final response = await _apiClient.get(ApiEndpoints.exportJob(jobId));
    return ExportJobModel.fromJson(response.data['data']);
  }

  /// Download a completed export job's file via the authenticated API.
  Future<void> downloadExportJob(String jobId) async {
    await _downloadFileViaApi(
      ApiEndpoints.exportJobDownload(jobId),
      'export_$jobId.xlsx',
    );
  }

  /// Legacy method kept for backward compatibility.
  Future<void> downloadExport(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  /// Downloads a file from an authenticated API endpoint.
  /// On web, triggers a browser download. On mobile, opens the URL.
  Future<void> _downloadFileViaApi(String path, String fileName) async {
    if (kIsWeb) {
      final response = await _apiClient.dio.get<List<int>>(
        path,
        options: Options(responseType: ResponseType.bytes),
      );
      triggerWebDownload(
        Uint8List.fromList(response.data!),
        fileName,
        response.headers.value('content-type') ?? 'application/octet-stream',
      );
    } else {
      final url = Uri.parse('${AppConstants.apiBaseUrl}$path');
      if (await canLaunchUrl(url)) {
        await launchUrl(url);
      }
    }
  }
}
