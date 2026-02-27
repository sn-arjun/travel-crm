import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import '../../data/models/visa_application.dart';
import '../../data/models/visa_checklist_item.dart';
import '../../data/models/visa_checklist_item.dart' as note_model;
import '../../data/repositories/visa_repository.dart';

part 'visa_provider.freezed.dart';

// ============================================================================
// VISA LIST STATE
// ============================================================================

@freezed
abstract class VisaListState with _$VisaListState {
  const factory VisaListState({
    @Default([]) List<VisaApplication> visas,
    @Default(true) bool isLoading,
    String? error,
    String? statusFilter,
  }) = _VisaListState;
}

class VisaListNotifier extends StateNotifier<VisaListState> {
  final VisaRepository _repository;

  VisaListNotifier(this._repository) : super(const VisaListState()) {
    loadVisas();
  }

  Future<void> loadVisas({String? leadId, bool refresh = false}) async {
    if (!refresh && state.isLoading && state.visas.isNotEmpty) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final response = await _repository.getVisaApplications(
        leadId: leadId,
        status: state.statusFilter,
      );
      
      state = state.copyWith(
        visas: response.data,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  void setFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    loadVisas(refresh: true);
  }

  Future<void> deleteVisa(String id) async {
    try {
      await _repository.deleteVisaApplication(id);
      loadVisas(refresh: true);
    } catch (e) {
      throw Exception('Failed to delete visa: $e');
    }
  }
}

final visaListProvider =
    StateNotifierProvider<VisaListNotifier, VisaListState>((ref) {
  final repository = ref.watch(visaRepositoryProvider);
  return VisaListNotifier(repository);
});

// ============================================================================
// VISA DETAIL STATE
// ============================================================================

@freezed
abstract class VisaDetailState with _$VisaDetailState {
  const factory VisaDetailState({
    VisaApplication? visa,
    @Default([]) List<VisaChecklistItem> checklist,
    @Default([]) List<note_model.VisaNote> notes,
    @Default(true) bool isLoading,
    String? error,
  }) = _VisaDetailState;
}

class VisaDetailNotifier extends StateNotifier<VisaDetailState> {
  final VisaRepository _repository;
  final String _visaId;

  VisaDetailNotifier(this._repository, this._visaId) : super(const VisaDetailState()) {
    loadDetails();
  }

  Future<void> loadDetails() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final details = await _repository.getVisaApplicationDetails(_visaId);

      state = state.copyWith(
        visa: details['visa'] as VisaApplication,
        checklist: details['checklist'] as List<VisaChecklistItem>,
        notes: details['notes'] as List<note_model.VisaNote>,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  Future<void> updateChecklistItem(String itemId, bool isReceived, {String? notes}) async {
    try {
      await _repository.updateChecklistItem(_visaId, itemId, isReceived, notes: notes);
      await loadDetails(); // Reload to get updated checklist and potentially updated master status
    } catch (e) {
      throw Exception('Failed to update checklist item: $e');
    }
  }

  Future<void> addNote(String content) async {
    try {
      await _repository.addNote(_visaId, content);
      await loadDetails(); // Reload to get new note
    } catch (e) {
      throw Exception('Failed to add note: $e');
    }
  }
}

final visaDetailProvider = StateNotifierProvider.family<
    VisaDetailNotifier, VisaDetailState, String>((ref, id) {
  final repository = ref.watch(visaRepositoryProvider);
  return VisaDetailNotifier(repository, id);
});
