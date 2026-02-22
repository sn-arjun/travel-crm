import 'package:shared/shared.dart';

enum CommunicationStatus { initial, loading, loaded, error }

class MessageHistoryState {
  final CommunicationStatus status;
  final List<Map<String, dynamic>> messages;
  final PaginationMeta? pagination;
  final String? channelFilter;
  final String? error;

  const MessageHistoryState({
    this.status = CommunicationStatus.initial,
    this.messages = const [],
    this.pagination,
    this.channelFilter,
    this.error,
  });

  MessageHistoryState copyWith({
    CommunicationStatus? status,
    List<Map<String, dynamic>>? messages,
    PaginationMeta? pagination,
    String? channelFilter,
    String? error,
  }) {
    return MessageHistoryState(
      status: status ?? this.status,
      messages: messages ?? this.messages,
      pagination: pagination ?? this.pagination,
      channelFilter: channelFilter ?? this.channelFilter,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalMessages => pagination?.total ?? 0;
}

class CommunicationLogState {
  final CommunicationStatus status;
  final List<Map<String, dynamic>> messages;
  final PaginationMeta? pagination;
  final String search;
  final String? channelFilter;
  final String? statusFilter;
  final DateTime? startDate;
  final DateTime? endDate;
  final String sortBy;
  final String sortOrder;
  final String? error;

  const CommunicationLogState({
    this.status = CommunicationStatus.initial,
    this.messages = const [],
    this.pagination,
    this.search = '',
    this.channelFilter,
    this.statusFilter,
    this.startDate,
    this.endDate,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.error,
  });

  CommunicationLogState copyWith({
    CommunicationStatus? status,
    List<Map<String, dynamic>>? messages,
    PaginationMeta? pagination,
    String? search,
    String? channelFilter,
    String? statusFilter,
    DateTime? startDate,
    DateTime? endDate,
    String? sortBy,
    String? sortOrder,
    String? error,
    bool clearFilters = false,
  }) {
    return CommunicationLogState(
      status: status ?? this.status,
      messages: messages ?? this.messages,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      channelFilter: clearFilters ? null : (channelFilter ?? this.channelFilter),
      statusFilter: clearFilters ? null : (statusFilter ?? this.statusFilter),
      startDate: clearFilters ? null : (startDate ?? this.startDate),
      endDate: clearFilters ? null : (endDate ?? this.endDate),
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalMessages => pagination?.total ?? 0;
}

class TemplateListState {
  final CommunicationStatus status;
  final List<Map<String, dynamic>> templates;
  final PaginationMeta? pagination;
  final String? channelFilter;
  final String? categoryFilter;
  final String search;
  final String? error;

  const TemplateListState({
    this.status = CommunicationStatus.initial,
    this.templates = const [],
    this.pagination,
    this.channelFilter,
    this.categoryFilter,
    this.search = '',
    this.error,
  });

  TemplateListState copyWith({
    CommunicationStatus? status,
    List<Map<String, dynamic>>? templates,
    PaginationMeta? pagination,
    String? channelFilter,
    String? categoryFilter,
    String? search,
    String? error,
  }) {
    return TemplateListState(
      status: status ?? this.status,
      templates: templates ?? this.templates,
      pagination: pagination ?? this.pagination,
      channelFilter: channelFilter ?? this.channelFilter,
      categoryFilter: categoryFilter ?? this.categoryFilter,
      search: search ?? this.search,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalTemplates => pagination?.total ?? 0;
}

class BulkSendState {
  final CommunicationStatus status;
  final String? batchId;
  final int sentCount;
  final int totalCount;
  final String? error;

  const BulkSendState({
    this.status = CommunicationStatus.initial,
    this.batchId,
    this.sentCount = 0,
    this.totalCount = 0,
    this.error,
  });

  BulkSendState copyWith({
    CommunicationStatus? status,
    String? batchId,
    int? sentCount,
    int? totalCount,
    String? error,
  }) {
    return BulkSendState(
      status: status ?? this.status,
      batchId: batchId ?? this.batchId,
      sentCount: sentCount ?? this.sentCount,
      totalCount: totalCount ?? this.totalCount,
      error: error,
    );
  }

  double get progress => totalCount > 0 ? sentCount / totalCount : 0;
  bool get isComplete => sentCount == totalCount && sentCount > 0;
}
