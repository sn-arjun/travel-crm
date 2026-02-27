import 'package:shared/shared.dart';

class LeadRepository {
  final ApiClient _apiClient;

  LeadRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<LeadListResponse> getLeads({
    int page = 1,
    int limit = 20,
    String? search,
    String? status,
    String? priority,
    String? assignedTo,
    String? source,
    String? tripType,
    String? destination,
    String? travelDateFrom,
    String? travelDateTo,
    double? budgetMin,
    double? budgetMax,
    String? view,
    String sortBy = 'createdAt',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
      if (search != null && search.isNotEmpty) 'search': search,
      'view': ?view,
      'status': ?status,
      'priority': ?priority,
      'assignedTo': ?assignedTo,
      'source': ?source,
      'tripType': ?tripType,
      'destination': ?destination,
      'travelDateFrom': ?travelDateFrom,
      'travelDateTo': ?travelDateTo,
      'budgetMin': ?budgetMin,
      'budgetMax': ?budgetMax,
    };

    final response = await _apiClient.get(
      ApiEndpoints.leads,
      queryParameters: params,
    );
    return LeadListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<PipelineData> getPipeline({String? assignedTo}) async {
    final response = await _apiClient.get(
      ApiEndpoints.leads,
      queryParameters: {
        'view': 'pipeline',
        'assignedTo': ?assignedTo,
      },
    );
    return PipelineData.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<LeadModel> getLead(String id) async {
    final response = await _apiClient.get(ApiEndpoints.lead(id));
    return LeadModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<LeadModel> createLead(Map<String, dynamic> data) async {
    final response = await _apiClient.post(ApiEndpoints.leads, data: data);
    return LeadModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<LeadModel> updateLead(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(ApiEndpoints.lead(id), data: data);
    return LeadModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteLead(String id) async {
    await _apiClient.delete(ApiEndpoints.lead(id));
  }

  // ── Status ────────────────────────────────────────────────

  Future<LeadModel> changeStatus(
    String id, {
    required String status,
    String? lostReason,
    String? lostReasonNotes,
  }) async {
    final response = await _apiClient.put(
      ApiEndpoints.leadStatus(id),
      data: {
        'status': status,
        'lostReason': ?lostReason,
        'notes': ?lostReasonNotes,
      },
    );
    return LeadModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Assignment ────────────────────────────────────────────

  Future<LeadModel> assignLead(String id, String userId) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadAssign(id),
      data: {'userId': userId},
    );
    return LeadModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Activities ────────────────────────────────────────────

  Future<List<LeadActivity>> getActivities(String leadId, {int page = 1}) async {
    final response = await _apiClient.get(
      ApiEndpoints.leadActivities(leadId),
      queryParameters: {'page': page},
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => LeadActivity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LeadActivity> logActivity(
    String leadId, {
    required String type,
    String? content,
    Map<String, dynamic>? metadata,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadActivities(leadId),
      data: {
        'type': type,
        'content': ?content,
        'metadata': ?metadata,
      },
    );
    return LeadActivity.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Notes ─────────────────────────────────────────────────

  Future<List<LeadActivity>> getNotes(String leadId) async {
    final response = await _apiClient.get(ApiEndpoints.leadNotes(leadId));
    final list = response.data['data'] as List;
    return list
        .map((e) => LeadActivity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LeadActivity> createNote(String leadId, String content) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadNotes(leadId),
      data: {'content': content},
    );
    return LeadActivity.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<LeadActivity> updateNote(
    String leadId,
    String noteId,
    String content,
  ) async {
    final response = await _apiClient.put(
      ApiEndpoints.leadNote(leadId, noteId),
      data: {'content': content},
    );
    return LeadActivity.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteNote(String leadId, String noteId) async {
    await _apiClient.delete(ApiEndpoints.leadNote(leadId, noteId));
  }

  // ── Follow-ups ────────────────────────────────────────────

  Future<List<FollowUpModel>> getLeadFollowUps(String leadId) async {
    final response = await _apiClient.get(ApiEndpoints.leadFollowUps(leadId));
    final list = response.data['data'] as List;
    return list
        .map((e) => FollowUpModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Filter Options ────────────────────────────────────────

  Future<LeadFilterOptions> getFilterOptions() async {
    final response = await _apiClient.get(ApiEndpoints.leadsFilterOptions);
    return LeadFilterOptions.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Bulk Operations ───────────────────────────────────────

  Future<int> bulkAssign(List<String> leadIds, String userId) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadsBulkAssign,
      data: {'leadIds': leadIds, 'assignedTo': userId},
    );
    return response.data['data']['updated'] as int;
  }

  Future<int> bulkStatus(
    List<String> leadIds,
    String status, {
    String? lostReason,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadsBulkStatus,
      data: {
        'leadIds': leadIds,
        'status': status,
        'lostReason': ?lostReason,
      },
    );
    return response.data['data']['updated'] as int;
  }

  Future<int> bulkDelete(List<String> leadIds) async {
    final response = await _apiClient.post(
      ApiEndpoints.leadsBulkDelete,
      data: {'leadIds': leadIds},
    );
    return response.data['data']['deleted'] as int;
  }
}

// ── LeadListResponse ──────────────────────────────────────

class LeadListResponse {
  final List<LeadModel> data;
  final PaginationMeta? pagination;

  const LeadListResponse({required this.data, this.pagination});

  factory LeadListResponse.fromJson(Map<String, dynamic> json) {
    final dataList = (json['data'] as List? ?? [])
        .map((e) => LeadModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final paginationJson = json['pagination'];
    return LeadListResponse(
      data: dataList,
      pagination: paginationJson != null
          ? PaginationMeta.fromJson(paginationJson as Map<String, dynamic>)
          : null,
    );
  }
}
