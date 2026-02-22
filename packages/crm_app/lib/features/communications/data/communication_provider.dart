import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'communication_repository.dart';
import 'communication_state.dart';
import 'template_repository.dart';

// ── Repository Providers ──────────────────────────────────────────
final communicationRepositoryProvider = Provider<CommunicationRepository>(
  (ref) => CommunicationRepository(apiClient: ref.read(apiClientProvider)),
);

final templateRepositoryProvider = Provider<TemplateRepository>(
  (ref) => TemplateRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Message History Provider ──────────────────────────────────────
final messageHistoryProvider = StateNotifierProvider.family<
    MessageHistoryNotifier,
    MessageHistoryState,
    String>(
  (ref, contactId) => MessageHistoryNotifier(
    contactId: contactId,
    repository: ref.read(communicationRepositoryProvider),
  ),
);

class MessageHistoryNotifier extends StateNotifier<MessageHistoryState> {
  final String _contactId;
  final CommunicationRepository _repository;

  MessageHistoryNotifier({
    required String contactId,
    required CommunicationRepository repository,
  })  : _contactId = contactId,
        _repository = repository,
        super(const MessageHistoryState());

  Future<void> loadHistory({bool refresh = false}) async {
    if (state.status == CommunicationStatus.loading) return;

    state = state.copyWith(
      status: CommunicationStatus.loading,
      messages: refresh ? [] : state.messages,
    );

    try {
      final response = await _repository.getHistory(
        contactId: _contactId,
        channel: state.channelFilter,
        page: 1,
      );

      final messages = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        messages: messages,
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == CommunicationStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: CommunicationStatus.loading);

    try {
      final response = await _repository.getHistory(
        contactId: _contactId,
        channel: state.channelFilter,
        page: nextPage,
      );

      final messages = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        messages: [...state.messages, ...messages],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setChannelFilter(String? channel) {
    state = state.copyWith(channelFilter: channel);
    loadHistory(refresh: true);
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Failed to load message history';
  }
}

// ── Communication Log Provider ────────────────────────────────────
final communicationLogProvider =
    StateNotifierProvider<CommunicationLogNotifier, CommunicationLogState>(
  (ref) => CommunicationLogNotifier(
    repository: ref.read(communicationRepositoryProvider),
  ),
);

class CommunicationLogNotifier extends StateNotifier<CommunicationLogState> {
  final CommunicationRepository _repository;

  CommunicationLogNotifier({required CommunicationRepository repository})
      : _repository = repository,
        super(const CommunicationLogState());

  Future<void> loadLog({bool refresh = false}) async {
    if (state.status == CommunicationStatus.loading) return;

    state = state.copyWith(
      status: CommunicationStatus.loading,
      messages: refresh ? [] : state.messages,
    );

    try {
      final filters = <String, dynamic>{
        if (state.channelFilter != null) 'channel': state.channelFilter,
        if (state.statusFilter != null) 'status': state.statusFilter,
        if (state.startDate != null)
          'startDate': state.startDate!.toIso8601String().split('T')[0],
        if (state.endDate != null)
          'endDate': state.endDate!.toIso8601String().split('T')[0],
        if (state.search.isNotEmpty) 'search': state.search,
      };

      final response = await _repository.getLog(
        filters: filters,
        page: 1,
      );

      final messages = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        messages: messages,
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == CommunicationStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: CommunicationStatus.loading);

    try {
      final filters = <String, dynamic>{
        if (state.channelFilter != null) 'channel': state.channelFilter,
        if (state.statusFilter != null) 'status': state.statusFilter,
        if (state.startDate != null)
          'startDate': state.startDate!.toIso8601String().split('T')[0],
        if (state.endDate != null)
          'endDate': state.endDate!.toIso8601String().split('T')[0],
        if (state.search.isNotEmpty) 'search': state.search,
      };

      final response = await _repository.getLog(
        filters: filters,
        page: nextPage,
      );

      final messages = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        messages: [...state.messages, ...messages],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadLog(refresh: true);
  }

  void setChannelFilter(String? channel) {
    state = state.copyWith(channelFilter: channel);
    loadLog(refresh: true);
  }

  void setStatusFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    loadLog(refresh: true);
  }

  void setDateRange(DateTime? startDate, DateTime? endDate) {
    state = state.copyWith(startDate: startDate, endDate: endDate);
    loadLog(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(
      clearFilters: true,
      search: '',
    );
    loadLog(refresh: true);
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Failed to load communication log';
  }
}

// ── Template List Provider ────────────────────────────────────────
final templateListProvider =
    StateNotifierProvider<TemplateListNotifier, TemplateListState>(
  (ref) => TemplateListNotifier(
    repository: ref.read(templateRepositoryProvider),
  ),
);

class TemplateListNotifier extends StateNotifier<TemplateListState> {
  final TemplateRepository _repository;

  TemplateListNotifier({required TemplateRepository repository})
      : _repository = repository,
        super(const TemplateListState());

  Future<void> loadTemplates({bool refresh = false}) async {
    if (state.status == CommunicationStatus.loading) return;

    state = state.copyWith(
      status: CommunicationStatus.loading,
      templates: refresh ? [] : state.templates,
    );

    try {
      final response = await _repository.getTemplates(
        channel: state.channelFilter,
        category: state.categoryFilter,
        search: state.search.isEmpty ? null : state.search,
        page: 1,
      );

      final templates = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        templates: templates,
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == CommunicationStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: CommunicationStatus.loading);

    try {
      final response = await _repository.getTemplates(
        channel: state.channelFilter,
        category: state.categoryFilter,
        search: state.search.isEmpty ? null : state.search,
        page: nextPage,
      );

      final templates = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        templates: [...state.templates, ...templates],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadTemplates(refresh: true);
  }

  void setChannelFilter(String? channel) {
    state = state.copyWith(channelFilter: channel);
    loadTemplates(refresh: true);
  }

  void setCategoryFilter(String? category) {
    state = state.copyWith(categoryFilter: category);
    loadTemplates(refresh: true);
  }

  Future<void> deleteTemplate(String id) async {
    try {
      await _repository.deleteTemplate(id);
      state = state.copyWith(
        templates: state.templates
            .where((t) => (t['id'] as String?) != id)
            .toList(),
      );
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Something went wrong. Please try again.';
  }
}

// ── Bulk Send Provider ────────────────────────────────────────────
final bulkSendProvider =
    StateNotifierProvider<BulkSendNotifier, BulkSendState>(
  (ref) => BulkSendNotifier(
    repository: ref.read(communicationRepositoryProvider),
  ),
);

class BulkSendNotifier extends StateNotifier<BulkSendState> {
  final CommunicationRepository _repository;

  BulkSendNotifier({required CommunicationRepository repository})
      : _repository = repository,
        super(const BulkSendState());

  Future<void> send({
    required String channel,
    String? templateId,
    String? message,
    required List<String> contactIds,
  }) async {
    state = state.copyWith(
      status: CommunicationStatus.loading,
      totalCount: contactIds.length,
    );

    try {
      final response = await _repository.bulkSend(
        channel: channel,
        templateId: templateId,
        message: message,
        contactIds: contactIds,
      );

      state = state.copyWith(
        status: CommunicationStatus.loaded,
        batchId: response['batchId'] as String?,
      );
    } catch (e) {
      state = state.copyWith(
        status: CommunicationStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> checkStatus() async {
    if (state.batchId == null) return;

    try {
      final response = await _repository.getBulkSendStatus(state.batchId!);
      state = state.copyWith(
        sentCount: response['sentCount'] as int? ?? 0,
        totalCount: response['totalCount'] as int? ?? state.totalCount,
      );
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  void reset() {
    state = const BulkSendState();
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Failed to send messages';
  }
}
