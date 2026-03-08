import 'package:shared/shared.dart';

class BookmarkRepository {
  final ApiClient _apiClient;

  BookmarkRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<List<BookmarkModel>> getBookmarks({String? entityType}) async {
    final params = <String, dynamic>{
      'entity_type': ?entityType,
    };
    final response = await _apiClient.get(
      ApiEndpoints.bookmarks,
      queryParameters: params,
    );
    final data = response.data['data'] as List;
    return data.map((e) => BookmarkModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<BookmarkModel> addBookmark(String entityType, String entityId) async {
    final response = await _apiClient.post(
      ApiEndpoints.bookmarks,
      data: {'entity_type': entityType, 'entity_id': entityId},
    );
    return BookmarkModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> removeBookmark(String id) async {
    await _apiClient.delete(ApiEndpoints.bookmark(id));
  }

  Future<({bool bookmarked, String? bookmarkId})> checkBookmark(
    String entityType,
    String entityId,
  ) async {
    final response = await _apiClient.get(
      ApiEndpoints.bookmarkCheck,
      queryParameters: {'entity_type': entityType, 'entity_id': entityId},
    );
    final data = response.data['data'] as Map<String, dynamic>;
    return (
      bookmarked: data['bookmarked'] as bool,
      bookmarkId: data['bookmark_id'] as String?,
    );
  }
}

class StickyNoteRepository {
  final ApiClient _apiClient;

  StickyNoteRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<List<StickyNoteModel>> getNotes() async {
    final response = await _apiClient.get(ApiEndpoints.stickyNotes);
    final data = response.data['data'] as List;
    return data.map((e) => StickyNoteModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<StickyNoteModel> createNote(String content, String color) async {
    final response = await _apiClient.post(
      ApiEndpoints.stickyNotes,
      data: {'content': content, 'color': color},
    );
    return StickyNoteModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<void> updateNote(String id, {String? content, String? color, bool? isPinned}) async {
    final data = <String, dynamic>{
      'content': ?content,
      'color': ?color,
      'is_pinned': ?isPinned,
    };
    await _apiClient.put(ApiEndpoints.stickyNote(id), data: data);
  }

  Future<void> deleteNote(String id) async {
    await _apiClient.delete(ApiEndpoints.stickyNote(id));
  }
}
