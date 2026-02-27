import 'package:shared/shared.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/visa_application.dart';
import '../models/visa_checklist_item.dart';
import '../../../auth/data/auth_provider.dart';

final visaRepositoryProvider = Provider<VisaRepository>((ref) {
  return VisaRepository(ref.watch(apiClientProvider));
});

class VisaRepository {
  final ApiClient _apiClient;

  VisaRepository(this._apiClient);

  Future<PaginatedResponse<VisaApplication>> getVisaApplications({
    String? leadId,
    String? status,
  }) async {
    final Map<String, dynamic> queryParameters = {};
    if (leadId != null) queryParameters['lead_id'] = leadId;
    if (status != null) queryParameters['status'] = status;

    final response = await _apiClient.get(
      ApiEndpoints.visaApplications,
      queryParameters: queryParameters,
    );
    
    final data = (response.data['data'] as List).map((e) => VisaApplication.fromJson(e)).toList();
    return PaginatedResponse(
      data: data,
      pagination: PaginationMeta.fromJson(response.data['meta'] ?? {}),
    );
  }

  Future<Map<String, dynamic>> getVisaApplicationDetails(String id) async {
    final response = await _apiClient.get(ApiEndpoints.visaApplication(id));
    final data = response.data['data'];
    
    final visa = VisaApplication.fromJson(data as Map<String, dynamic>);
    
    final checklistRaw = data['checklist'] as List? ?? [];
    final checklist = checklistRaw.map((e) => VisaChecklistItem.fromJson(e)).toList();

    final notesRaw = data['notes'] as List? ?? [];
    final notes = notesRaw.map((e) => e as Map<String, dynamic>).toList();

    return {
      'visa': visa,
      'checklist': checklist,
      'notes': notes,
    };
  }

  Future<VisaApplication> createVisaApplication(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.visaApplications, data: data);
    return VisaApplication.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<VisaApplication> updateVisaApplication(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.visaApplication(id), data: data);
    return VisaApplication.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteVisaApplication(String id) async {
    await _apiClient.delete(ApiEndpoints.visaApplication(id));
  }

  Future<void> updateChecklistItem(String visaId, String itemId, bool isReceived, {String? notes}) async {
    final Map<String, dynamic> data = {'isReceived': isReceived};
    if (notes != null) data['notes'] = notes;
    await _apiClient.put(
      ApiEndpoints.visaChecklistItem(visaId, itemId),
      data: data,
    );
  }

  Future<void> addNote(String visaId, String content) async {
    await _apiClient.post(
      ApiEndpoints.visaNotes(visaId),
      data: {'content': content},
    );
  }
}
