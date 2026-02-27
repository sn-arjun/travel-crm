import 'package:shared/shared.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/supplier.dart';
import '../models/supplier_rate_card.dart';
import '../models/ledger_entry.dart';
import '../../../auth/data/auth_provider.dart';

final supplierRepositoryProvider = Provider<SupplierRepository>((ref) {
  return SupplierRepository(ref.watch(apiClientProvider));
});

class SupplierRepository {
  final ApiClient _apiClient;

  SupplierRepository(this._apiClient);

  Future<PaginatedResponse<Supplier>> getSuppliers({
    int page = 1,
    int limit = 20,
    String? category,
    String? status,
    String? search,
    String? sortBy,
    String? sortOrder,
    bool? isPreferred,
  }) async {
    final Map<String, dynamic> queryParameters = {
      'page': page.toString(),
      'limit': limit.toString(),
      'category': ?category,
      'status': ?status,
      'search': ?search,
      'sort_by': ?sortBy,
      'sort_order': ?sortOrder,
      if (isPreferred != null) 'is_preferred': isPreferred.toString(),
    };

    final response = await _apiClient.get(
      ApiEndpoints.suppliers,
      queryParameters: queryParameters,
    );
    
    return PaginatedResponse.fromJson(
      response.data as Map<String, dynamic>,
      (json) => Supplier.fromJson(json),
    );
  }

  Future<Supplier> getSupplier(String id) async {
    final response = await _apiClient.get(ApiEndpoints.supplier(id));
    return Supplier.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<Supplier> createSupplier(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.suppliers, data: data);
    return Supplier.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<Supplier> updateSupplier(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.supplier(id), data: data);
    return Supplier.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteSupplier(String id) async {
    await _apiClient.delete(ApiEndpoints.supplier(id));
  }

  Future<bool> togglePreferred(String id) async {
    final response = await _apiClient.post('${ApiEndpoints.supplier(id)}/toggle-preferred');
    return response.data['is_preferred'] as bool;
  }

  Future<List<SupplierRateCard>> getSupplierRateCards(String id) async {
    final response = await _apiClient.get(ApiEndpoints.supplierRateCards(id));
    final List<dynamic> data = response.data['data'] as List<dynamic>;
    return data.map((json) => SupplierRateCard.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<SupplierRateCard> createRateCard(String supplierId, Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.supplierRateCards(supplierId), data: data);
    // Returning dummy rate card since the backend just returns {id}, ideally backend should return the whole object
    // For now we'll just fetch them all again or trust the local state
    return SupplierRateCard.fromJson({...data, 'id': response.data['id'], 'supplier_id': supplierId});
  }

  Future<List<LedgerEntry>> getSupplierLedger(String id) async {
    final response = await _apiClient.get(ApiEndpoints.supplierLedger(id));
    final List<dynamic> data = response.data['data'] as List<dynamic>;
    return data.map((json) => LedgerEntry.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<void> recordPayment(String supplierId, Map<String, dynamic> data) async {
    await _apiClient.post(ApiEndpoints.supplierPayments(supplierId), data: data);
  }
}
