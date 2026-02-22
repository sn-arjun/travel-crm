import 'package:shared/shared.dart';

class FollowUpRepository {
  final ApiClient _apiClient;

  FollowUpRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<List<FollowUpModel>> getFollowUps({
    String? filter, // today | overdue | upcoming
    bool team = false,
  }) async {
    final response = await _apiClient.get(
      ApiEndpoints.followUps,
      queryParameters: {
        if (filter != null) 'filter': filter,
        if (team) 'team': 'true',
      },
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => FollowUpModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FollowUpModel> scheduleFollowUp({
    required String leadId,
    required String scheduledAt,
    required String type,
    String? notes,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.followUps,
      data: {
        'leadId': leadId,
        'scheduledAt': scheduledAt,
        'type': type,
        if (notes != null) 'notes': notes,
      },
    );
    return FollowUpModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<FollowUpModel> updateFollowUp(
    String id, {
    String? scheduledAt,
    String? type,
    String? notes,
  }) async {
    final response = await _apiClient.put(
      ApiEndpoints.followUp(id),
      data: {
        if (scheduledAt != null) 'scheduledAt': scheduledAt,
        if (type != null) 'type': type,
        if (notes != null) 'notes': notes,
      },
    );
    return FollowUpModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<FollowUpModel> completeFollowUp(String id, {String? outcomeNotes}) async {
    final response = await _apiClient.put(
      ApiEndpoints.followUpComplete(id),
      data: {
        if (outcomeNotes != null) 'outcomeNotes': outcomeNotes,
      },
    );
    return FollowUpModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> cancelFollowUp(String id) async {
    await _apiClient.delete(ApiEndpoints.followUp(id));
  }
}
