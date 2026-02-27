import 'package:dio/dio.dart';
import 'package:shared/shared.dart';
import '../models/report_state.dart';

class ReportRepository {
  final Dio _dio;

  ReportRepository(this._dio);

  Future<List<ReportDefinition>> getAvailableReports() async {
    try {
      final response = await _dio.get(ApiEndpoints.reports);
      final data = response.data['data'] as List;
      return data.map((e) => ReportDefinition.fromJson(e)).toList();
    } catch (e) {
      throw Exception('Failed to fetch report definitions: $e');
    }
  }

  Future<ReportResult> executeReport(String reportId, Map<String, dynamic> params) async {
    try {
      final response = await _dio.get('${ApiEndpoints.reports}/$reportId', queryParameters: params);
      return ReportResult.fromJson(response.data['data']);
    } catch (e) {
      throw Exception('Failed to execute report: $e');
    }
  }

  Future<void> exportReport(String reportId, Map<String, dynamic> params, String format) async {
    try {
      final queryParams = {...params, 'format': format};
      await _dio.get(
        '${ApiEndpoints.reports}/$reportId/export',
        queryParameters: queryParams,
      );
    } catch (e) {
      throw Exception('Failed to export report: $e');
    }
  }
}
