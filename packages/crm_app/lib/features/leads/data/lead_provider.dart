import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'lead_repository.dart';
import 'lead_state.dart';

// ── Repository Provider ─────────────────────────────────────

final leadRepositoryProvider = Provider<LeadRepository>(
  (ref) => LeadRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Lead List Provider ──────────────────────────────────────

final leadListProvider =
    StateNotifierProvider<LeadListNotifier, LeadListState>(
  (ref) => LeadListNotifier(
    repository: ref.read(leadRepositoryProvider),
  ),
);

class LeadListNotifier extends StateNotifier<LeadListState> {
  final LeadRepository _repository;

  LeadListNotifier({required LeadRepository repository})
      : _repository = repository,
        super(const LeadListState());

  Future<void> loadLeads({bool refresh = false}) async {
    if (state.status == LeadListStatus.loading) return;

    state = state.copyWith(
      status: LeadListStatus.loading,
      leads: refresh ? [] : state.leads,
    );

    try {
      final response = await _repository.getLeads(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        priority: state.priorityFilter,
        assignedTo: state.assignedToFilter,
        source: state.sourceFilter,
        tripType: state.tripTypeFilter,
        destination: state.destinationFilter,
        travelDateFrom: state.travelDateFrom,
        travelDateTo: state.travelDateTo,
        budgetMin: state.budgetMin,
        budgetMax: state.budgetMax,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: LeadListStatus.loaded,
        leads: response.data,
        pagination: response.pagination,
        selectedIds: {},
      );
    } catch (e) {
      state = state.copyWith(
        status: LeadListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == LeadListStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: LeadListStatus.loading);

    try {
      final response = await _repository.getLeads(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        priority: state.priorityFilter,
        assignedTo: state.assignedToFilter,
        source: state.sourceFilter,
        tripType: state.tripTypeFilter,
        destination: state.destinationFilter,
        travelDateFrom: state.travelDateFrom,
        travelDateTo: state.travelDateTo,
        budgetMin: state.budgetMin,
        budgetMax: state.budgetMax,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: LeadListStatus.loaded,
        leads: [...state.leads, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: LeadListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadLeads(refresh: true);
  }

  void setFilter({
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
  }) {
    state = state.copyWith(
      statusFilter: status,
      priorityFilter: priority,
      assignedToFilter: assignedTo,
      sourceFilter: source,
      tripTypeFilter: tripType,
      destinationFilter: destination,
      travelDateFrom: travelDateFrom,
      travelDateTo: travelDateTo,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
    );
    loadLeads(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(clearFilters: true, search: '');
    loadLeads(refresh: true);
  }

  void setSort(String sortBy, String sortOrder) {
    state = state.copyWith(sortBy: sortBy, sortOrder: sortOrder);
    loadLeads(refresh: true);
  }

  void setView(String view) {
    state = state.copyWith(view: view);
  }

  void toggleSelection(String id) {
    final selected = Set<String>.from(state.selectedIds);
    if (selected.contains(id)) {
      selected.remove(id);
    } else {
      selected.add(id);
    }
    state = state.copyWith(selectedIds: selected);
  }

  void selectAll() {
    state = state.copyWith(
      selectedIds: state.leads.map((l) => l.id).toSet(),
    );
  }

  void clearSelection() {
    state = state.copyWith(selectedIds: {});
  }

  Future<void> deleteLead(String id) async {
    try {
      await _repository.deleteLead(id);
      state = state.copyWith(
        leads: state.leads.where((l) => l.id != id).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  Future<void> bulkAssign(String userId) async {
    try {
      await _repository.bulkAssign(state.selectedIds.toList(), userId);
      state = state.copyWith(selectedIds: {});
      await loadLeads(refresh: true);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  Future<void> bulkStatus(String status, {String? lostReason}) async {
    try {
      await _repository.bulkStatus(
        state.selectedIds.toList(),
        status,
        lostReason: lostReason,
      );
      state = state.copyWith(selectedIds: {});
      await loadLeads(refresh: true);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  Future<void> bulkDelete() async {
    try {
      await _repository.bulkDelete(state.selectedIds.toList());
      state = state.copyWith(selectedIds: {});
      await loadLeads(refresh: true);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Something went wrong. Please try again.';
  }
}

// ── Pipeline Provider ───────────────────────────────────────

final pipelineProvider =
    StateNotifierProvider<PipelineNotifier, PipelineState>(
  (ref) => PipelineNotifier(
    repository: ref.read(leadRepositoryProvider),
  ),
);

class PipelineNotifier extends StateNotifier<PipelineState> {
  final LeadRepository _repository;

  PipelineNotifier({required LeadRepository repository})
      : _repository = repository,
        super(const PipelineState());

  Future<void> load({String? assignedTo}) async {
    state = state.copyWith(status: PipelineStatus.loading);

    try {
      final data = await _repository.getPipeline(assignedTo: assignedTo);
      state = state.copyWith(
        status: PipelineStatus.loaded,
        data: data,
      );
    } catch (e) {
      state = state.copyWith(
        status: PipelineStatus.error,
        error: e is ApiException ? e.message : 'Failed to load pipeline',
      );
    }
  }

  void updateLeadInStage(LeadModel updatedLead, String oldStatus) {
    final data = state.data;
    if (data == null) return;

    final updatedStages = data.stages.map((stage) {
      if (stage.name == oldStatus) {
        return stage.copyWith(
          leads: stage.leads.where((l) => l.id != updatedLead.id).toList(),
          count: stage.count - 1,
        );
      }
      if (stage.name == updatedLead.status) {
        return stage.copyWith(
          leads: [updatedLead, ...stage.leads],
          count: stage.count + 1,
        );
      }
      return stage;
    }).toList();

    state = state.copyWith(data: data.copyWith(stages: updatedStages));
  }
}

// ── Lead Detail Provider (family) ───────────────────────────

final leadDetailProvider = StateNotifierProvider.family<
    LeadDetailNotifier, LeadDetailState, String>(
  (ref, leadId) => LeadDetailNotifier(
    leadId: leadId,
    repository: ref.read(leadRepositoryProvider),
  ),
);

class LeadDetailNotifier extends StateNotifier<LeadDetailState> {
  final String _leadId;
  final LeadRepository _repository;

  LeadDetailNotifier({
    required String leadId,
    required LeadRepository repository,
  })  : _leadId = leadId,
        _repository = repository,
        super(const LeadDetailState());

  Future<void> load() async {
    state = state.copyWith(status: LeadDetailStatus.loading);

    try {
      final lead = await _repository.getLead(_leadId);
      state = state.copyWith(
        status: LeadDetailStatus.loaded,
        lead: lead,
      );
    } catch (e) {
      state = state.copyWith(
        status: LeadDetailStatus.error,
        error: e is ApiException ? e.message : 'Failed to load lead',
      );
    }
  }

  Future<void> loadActivities({int page = 1}) async {
    state = state.copyWith(activitiesLoading: true);
    try {
      final activities = await _repository.getActivities(_leadId, page: page);
      state = state.copyWith(
        activities: page == 1 ? activities : [...state.activities, ...activities],
        activitiesLoading: false,
      );
    } catch (_) {
      state = state.copyWith(activitiesLoading: false);
    }
  }

  Future<void> loadNotes() async {
    state = state.copyWith(notesLoading: true);
    try {
      final notes = await _repository.getNotes(_leadId);
      state = state.copyWith(notes: notes, notesLoading: false);
    } catch (_) {
      state = state.copyWith(notesLoading: false);
    }
  }

  Future<void> loadFollowUps() async {
    state = state.copyWith(followUpsLoading: true);
    try {
      final followUps = await _repository.getLeadFollowUps(_leadId);
      state = state.copyWith(followUps: followUps, followUpsLoading: false);
    } catch (_) {
      state = state.copyWith(followUpsLoading: false);
    }
  }

  Future<void> changeStatus(
    String status, {
    String? lostReason,
    String? lostReasonNotes,
  }) async {
    try {
      final updated = await _repository.changeStatus(
        _leadId,
        status: status,
        lostReason: lostReason,
        lostReasonNotes: lostReasonNotes,
      );
      state = state.copyWith(lead: updated);
      await loadActivities();
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to update status',
      );
    }
  }

  Future<void> addNote(String content) async {
    try {
      final note = await _repository.createNote(_leadId, content);
      state = state.copyWith(notes: [note, ...state.notes]);
      await loadActivities();
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to save note',
      );
    }
  }

  Future<void> updateNote(String noteId, String content) async {
    try {
      final updated = await _repository.updateNote(_leadId, noteId, content);
      state = state.copyWith(
        notes: state.notes.map((n) => n.id == noteId ? updated : n).toList(),
      );
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to update note',
      );
    }
  }

  Future<void> deleteNote(String noteId) async {
    try {
      await _repository.deleteNote(_leadId, noteId);
      state = state.copyWith(
        notes: state.notes.where((n) => n.id != noteId).toList(),
      );
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to delete note',
      );
    }
  }
}

// ── Simple Async Providers ──────────────────────────────────

final leadsFilterOptionsProvider = FutureProvider<LeadFilterOptions>((ref) {
  return ref.read(leadRepositoryProvider).getFilterOptions();
});
