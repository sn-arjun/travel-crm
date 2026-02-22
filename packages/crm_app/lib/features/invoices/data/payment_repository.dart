import 'package:shared/shared.dart';

class PaymentRepository {
  final ApiClient _apiClient;

  PaymentRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<Map<String, dynamic>> getPayments({
    int page = 1,
    int limit = 20,
    String? search,
    String? type,
    String? method,
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
      if (type != null && type.isNotEmpty) 'type': type,
      if (method != null && method.isNotEmpty) 'method': method,
      if (startDate != null) 'startDate': startDate.toIso8601String().split('T')[0],
      if (endDate != null) 'endDate': endDate.toIso8601String().split('T')[0],
    };

    final response = await _apiClient.get(
      ApiEndpoints.payments,
      queryParameters: params,
    );
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getPayment(String id) async {
    final response = await _apiClient.get(ApiEndpoints.payment(id));
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> recordPayment({
    required String invoiceId,
    required double amount,
    required String method,
    required String type,
    String? referenceNumber,
    String? notes,
    DateTime? paymentDate,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.payments,
      data: {
        'invoiceId': invoiceId,
        'amount': amount,
        'method': method,
        'type': type,
        if (referenceNumber != null) 'referenceNumber': referenceNumber,
        if (notes != null) 'notes': notes,
        if (paymentDate != null) 'paymentDate': paymentDate.toIso8601String().split('T')[0],
      },
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> deletePayment(String id) async {
    await _apiClient.delete(ApiEndpoints.payment(id));
  }

  Future<Map<String, dynamic>> linkInvoice(
    String paymentId,
    String invoiceId,
  ) async {
    final response = await _apiClient.post(
      '${ApiEndpoints.payment(paymentId)}/link-invoice',
      data: {'invoiceId': invoiceId},
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> getPaymentsByInvoice(String invoiceId) async {
    final response = await _apiClient.get(
      '${ApiEndpoints.invoices}/$invoiceId/payments',
    );
    final list = response.data['data'] as List;
    return list.cast<Map<String, dynamic>>();
  }
}
