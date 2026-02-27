import 'package:shared/shared.dart';

import '../models/voucher.dart';

class VoucherRepository {
  final ApiClient _apiClient;

  VoucherRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<PaginatedResponse<Voucher>> getVouchers({
    int page = 1,
    int limit = 20,
    String? search,
    String? leadId,
    String? type,
    String? status,
  }) async {
    final Map<String, dynamic> query = {
      'page': page,
      'limit': limit,
    };
    if (search != null && search.isNotEmpty) query['search'] = search;
    if (leadId != null && leadId.isNotEmpty) query['leadId'] = leadId;
    if (type != null && type.isNotEmpty) query['type'] = type;
    if (status != null && status.isNotEmpty) query['status'] = status;

    final response = await _apiClient.get(
      ApiEndpoints.vouchers,
      queryParameters: query,
    );

    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => Voucher.fromJson(json),
    );
  }

  Future<Voucher> getVoucher(String id) async {
    final response = await _apiClient.get('${ApiEndpoints.vouchers}/$id');
    return Voucher.fromJson(response.data['data']);
  }

  Future<Voucher> createVoucher(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.vouchers, data: data);
    return Voucher.fromJson(response.data['data']);
  }

  Future<Voucher> updateVoucher(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put('${ApiEndpoints.vouchers}/$id', data: data);
    return Voucher.fromJson(response.data['data']);
  }

  Future<void> deleteVoucher(String id) async {
    await _apiClient.delete('${ApiEndpoints.vouchers}/$id');
  }

  Future<void> updateStatus(String id, String status) async {
    await _apiClient.patch(
      '${ApiEndpoints.vouchers}/$id/status',
      data: {'status': status},
    );
  }

  Future<void> sendVoucher(String id, {required String channel, required String to}) async {
    await _apiClient.post(
      '${ApiEndpoints.vouchers}/$id/send',
      data: {'channel': channel, 'to': to},
    );
  }
}
