import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class InvoiceRepository {
  final ApiClient _apiClient;

  InvoiceRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<Map<String, dynamic>> getInvoices({
    int page = 1,
    int limit = 20,
    String? search,
    String? status,
    String? type,
    DateTime? startDate,
    DateTime? endDate,
    String sortBy = 'createdAt',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
      if (search != null && search.isNotEmpty) 'search': search,
      if (status != null && status.isNotEmpty) 'status': status,
      if (type != null && type.isNotEmpty) 'type': type,
      if (startDate != null) 'startDate': startDate.toIso8601String().split('T')[0],
      if (endDate != null) 'endDate': endDate.toIso8601String().split('T')[0],
    };

    final response = await _apiClient.get(
      ApiEndpoints.invoices,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getInvoice(String id) async {
    final response = await _apiClient.get(ApiEndpoints.invoice(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createInvoice(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.invoices,
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateInvoice(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.invoice(id),
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> deleteInvoice(String id) async {
    await _apiClient.delete(ApiEndpoints.invoice(id));
  }

  // ── Invoice Actions ──────────────────────────────────────

  Future<Map<String, dynamic>> voidInvoice(
    String id, {
    String? reason,
  }) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.invoice(id)}/void',
      data: {'reason': reason},
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> duplicateInvoice(String id) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.invoice(id)}/duplicate',
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createFromItinerary(String itineraryId) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.invoices}/from-itinerary',
      data: {'itineraryId': itineraryId},
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> sendInvoice(
    String id, {
    required String channel,
    String? email,
    String? phone,
    String? note,
  }) async {
    await _apiClient.post(
      ApiEndpoints.invoiceSend(id),
      data: {
        'channel': channel,
        'email': ?email,
        'phone': ?phone,
        'note': ?note,
      },
    );
  }

  Future<List<int>> getInvoicePdf(String id) async {
    final response = await _apiClient.get(
      ApiEndpoints.invoicePdf(id),
      options: Options(responseType: ResponseType.bytes),
    );
    return (response.data as List).cast<int>();
  }

  // ── Summary Stats ────────────────────────────────────────

  Future<Map<String, dynamic>> getSummaryStats() async {
    final response = await _apiClient.get(
      '${ApiEndpoints.invoices}/stats',
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  // ── Ageing Report ────────────────────────────────────────

  Future<Map<String, dynamic>> getAgeingReport({
    int page = 1,
    int limit = 20,
    String sortBy = 'daysOverdue',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
    };

    final response = await _apiClient.get(
      '${ApiEndpoints.invoices}/ageing-report',
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }
}
