import 'package:shared/shared.dart';

enum LeadListStatus { initial, loading, loaded, error }
enum PipelineStatus { initial, loading, loaded, error }
enum LeadDetailStatus { initial, loading, loaded, error }

// ── LeadListState ─────────────────────────────────────────

class LeadListState {
  final LeadListStatus status;
  final List<LeadModel> leads;
  final PaginationMeta? pagination;
  final String search;
  final String? statusFilter;
  final String? priorityFilter;
  final String? assignedToFilter;
  final String? sourceFilter;
  final String? tripTypeFilter;
  final String? destinationFilter;
  final String? travelDateFrom;
  final String? travelDateTo;
  final double? budgetMin;
  final double? budgetMax;
  final String sortBy;
  final String sortOrder;
  final String view; // 'list' | 'pipeline'
  final Set<String> selectedIds;
  final String? error;

  const LeadListState({
    this.status = LeadListStatus.initial,
    this.leads = const [],
    this.pagination,
    this.search = '',
    this.statusFilter,
    this.priorityFilter,
    this.assignedToFilter,
    this.sourceFilter,
    this.tripTypeFilter,
    this.destinationFilter,
    this.travelDateFrom,
    this.travelDateTo,
    this.budgetMin,
    this.budgetMax,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.view = 'pipeline',
    this.selectedIds = const {},
    this.error,
  });

  LeadListState copyWith({
    LeadListStatus? status,
    List<LeadModel>? leads,
    PaginationMeta? pagination,
    String? search,
    String? statusFilter,
    String? priorityFilter,
    String? assignedToFilter,
    String? sourceFilter,
    String? tripTypeFilter,
    String? destinationFilter,
    String? travelDateFrom,
    String? travelDateTo,
    double? budgetMin,
    double? budgetMax,
    String? sortBy,
    String? sortOrder,
    String? view,
    Set<String>? selectedIds,
    String? error,
    bool clearFilters = false,
  }) {
    return LeadListState(
      status: status ?? this.status,
      leads: leads ?? this.leads,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      statusFilter: clearFilters ? null : (statusFilter ?? this.statusFilter),
      priorityFilter: clearFilters ? null : (priorityFilter ?? this.priorityFilter),
      assignedToFilter: clearFilters ? null : (assignedToFilter ?? this.assignedToFilter),
      sourceFilter: clearFilters ? null : (sourceFilter ?? this.sourceFilter),
      tripTypeFilter: clearFilters ? null : (tripTypeFilter ?? this.tripTypeFilter),
      destinationFilter: clearFilters ? null : (destinationFilter ?? this.destinationFilter),
      travelDateFrom: clearFilters ? null : (travelDateFrom ?? this.travelDateFrom),
      travelDateTo: clearFilters ? null : (travelDateTo ?? this.travelDateTo),
      budgetMin: clearFilters ? null : (budgetMin ?? this.budgetMin),
      budgetMax: clearFilters ? null : (budgetMax ?? this.budgetMax),
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      view: view ?? this.view,
      selectedIds: selectedIds ?? this.selectedIds,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  bool get hasActiveFilters =>
      statusFilter != null ||
      priorityFilter != null ||
      assignedToFilter != null ||
      sourceFilter != null ||
      tripTypeFilter != null ||
      destinationFilter != null ||
      travelDateFrom != null ||
      travelDateTo != null ||
      budgetMin != null ||
      budgetMax != null ||
      search.isNotEmpty;
}

// ── PipelineState ─────────────────────────────────────────

class PipelineState {
  final PipelineStatus status;
  final PipelineData? data;
  final String? error;

  const PipelineState({
    this.status = PipelineStatus.initial,
    this.data,
    this.error,
  });

  PipelineState copyWith({
    PipelineStatus? status,
    PipelineData? data,
    String? error,
  }) {
    return PipelineState(
      status: status ?? this.status,
      data: data ?? this.data,
      error: error,
    );
  }
}

// ── LeadDetailState ───────────────────────────────────────

class LeadDetailState {
  final LeadDetailStatus status;
  final LeadModel? lead;
  final List<LeadActivity> activities;
  final List<LeadActivity> notes;
  final List<FollowUpModel> followUps;
  final bool activitiesLoading;
  final bool notesLoading;
  final bool followUpsLoading;
  final String? error;

  const LeadDetailState({
    this.status = LeadDetailStatus.initial,
    this.lead,
    this.activities = const [],
    this.notes = const [],
    this.followUps = const [],
    this.activitiesLoading = false,
    this.notesLoading = false,
    this.followUpsLoading = false,
    this.error,
  });

  LeadDetailState copyWith({
    LeadDetailStatus? status,
    LeadModel? lead,
    List<LeadActivity>? activities,
    List<LeadActivity>? notes,
    List<FollowUpModel>? followUps,
    bool? activitiesLoading,
    bool? notesLoading,
    bool? followUpsLoading,
    String? error,
  }) {
    return LeadDetailState(
      status: status ?? this.status,
      lead: lead ?? this.lead,
      activities: activities ?? this.activities,
      notes: notes ?? this.notes,
      followUps: followUps ?? this.followUps,
      activitiesLoading: activitiesLoading ?? this.activitiesLoading,
      notesLoading: notesLoading ?? this.notesLoading,
      followUpsLoading: followUpsLoading ?? this.followUpsLoading,
      error: error,
    );
  }
}
