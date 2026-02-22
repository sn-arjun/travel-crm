import 'package:dio/dio.dart';
import 'package:shared/shared.dart';

class ContactRepository {
  final ApiClient _apiClient;

  ContactRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  // ── CRUD ──────────────────────────────────────────────────

  Future<ContactListResponse> getContacts({
    int page = 1,
    int limit = 20,
    String? search,
    String? type,
    String? source,
    String? city,
    String? country,
    String? tag,
    String? language,
    String sortBy = 'createdAt',
    String sortOrder = 'desc',
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      'sortBy': sortBy,
      'sortOrder': sortOrder,
      if (search != null && search.isNotEmpty) 'search': search,
      if (type != null) 'type': type,
      if (source != null) 'source': source,
      if (city != null) 'city': city,
      if (country != null) 'country': country,
      if (tag != null) 'tag': tag,
      if (language != null) 'language': language,
    };

    final response = await _apiClient.get(
      ApiEndpoints.contacts,
      queryParameters: params,
    );
    return ContactListResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<ContactModel> getContact(String id) async {
    final response = await _apiClient.get(ApiEndpoints.contact(id));
    return ContactModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ContactModel> createContact(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.contacts,
      data: data,
    );
    return ContactModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ContactModel> updateContact(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(
      ApiEndpoints.contact(id),
      data: data,
    );
    return ContactModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteContact(String id) async {
    await _apiClient.delete(ApiEndpoints.contact(id));
  }

  // ── Duplicate Check ───────────────────────────────────────

  Future<ContactDuplicateCheck> checkDuplicate({
    String? email,
    String? phone,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.contactsCheckDuplicate,
      data: {
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
      },
    );
    return ContactDuplicateCheck.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Tags ──────────────────────────────────────────────────

  Future<List<String>> getTags() async {
    final response = await _apiClient.get(ApiEndpoints.contactsTags);
    final list = response.data['data'] as List;
    return list.cast<String>();
  }

  Future<int> bulkTag({
    required List<String> contactIds,
    required List<String> tags,
    required String action,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.contactsBulkTag,
      data: {
        'contactIds': contactIds,
        'tags': tags,
        'action': action,
      },
    );
    return response.data['data']['updated'] as int;
  }

  // ── Filter Options ────────────────────────────────────────

  Future<ContactFilterOptions> getFilterOptions() async {
    final response = await _apiClient.get(ApiEndpoints.contactsFilterOptions);
    return ContactFilterOptions.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Import / Export ───────────────────────────────────────

  Future<ImportResult> importContacts(String filePath) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: 'contacts.csv'),
    });
    final response = await _apiClient.upload(
      ApiEndpoints.contactsImport,
      data: formData,
    );
    return ImportResult.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<List<int>> exportContacts({
    String? type,
    String? source,
    String? city,
    String? country,
  }) async {
    final params = <String, dynamic>{
      if (type != null) 'type': type,
      if (source != null) 'source': source,
      if (city != null) 'city': city,
      if (country != null) 'country': country,
    };

    final response = await _apiClient.get(
      ApiEndpoints.contactsExport,
      queryParameters: params,
      options: Options(responseType: ResponseType.bytes),
    );
    return (response.data as List).cast<int>();
  }

  // ── Timeline ──────────────────────────────────────────────

  Future<List<TimelineEntry>> getTimeline(String contactId) async {
    final response = await _apiClient.get(
      ApiEndpoints.contactTimeline(contactId),
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => TimelineEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Upcoming Occasions ────────────────────────────────────

  Future<List<UpcomingOccasion>> getUpcomingOccasions({int days = 30}) async {
    final response = await _apiClient.get(
      ApiEndpoints.contactsUpcomingOccasions,
      queryParameters: {'days': days},
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => UpcomingOccasion.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Share ─────────────────────────────────────────────────

  Future<void> shareContact(String contactId, {
    required String sharedWith,
    String? note,
  }) async {
    await _apiClient.post(
      ApiEndpoints.contactShare(contactId),
      data: {
        'sharedWith': sharedWith,
        if (note != null) 'note': note,
      },
    );
  }

  Future<List<ContactModel>> getSharedWithMe() async {
    final response = await _apiClient.get(ApiEndpoints.contactsSharedWithMe);
    final list = response.data['data'] as List;
    return list
        .map((e) => ContactModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Merge ─────────────────────────────────────────────────

  Future<MergePreview> getMergePreview({
    required String primaryId,
    required String secondaryId,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.contactsMergePreview,
      data: {
        'primaryId': primaryId,
        'secondaryId': secondaryId,
      },
    );
    return MergePreview.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  Future<ContactModel> mergeContacts({
    required String primaryId,
    required String secondaryId,
  }) async {
    final response = await _apiClient.post(
      ApiEndpoints.contactsMerge,
      data: {
        'primaryId': primaryId,
        'secondaryId': secondaryId,
      },
    );
    return ContactModel.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  // ── Custom Fields ─────────────────────────────────────────

  Future<List<Map<String, dynamic>>> getCustomFieldDefs() async {
    final response = await _apiClient.get(ApiEndpoints.contactsCustomFields);
    final list = response.data['data'] as List;
    return list.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> createCustomFieldDef(Map<String, dynamic> data) async {
    final response = await _apiClient.post(
      ApiEndpoints.contactsCustomFields,
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateCustomFieldDef(String id, Map<String, dynamic> data) async {
    final response = await _apiClient.put(
      ApiEndpoints.contactCustomField(id),
      data: data,
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> deleteCustomFieldDef(String id) async {
    await _apiClient.delete(ApiEndpoints.contactCustomField(id));
  }
}
