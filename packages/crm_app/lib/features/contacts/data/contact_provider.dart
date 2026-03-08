import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'contact_repository.dart';
import 'contact_state.dart';

// ── Repository Provider ─────────────────────────────────────

final contactRepositoryProvider = Provider<ContactRepository>(
  (ref) => ContactRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Contact List Provider ───────────────────────────────────

final contactListProvider =
    StateNotifierProvider<ContactListNotifier, ContactListState>(
  (ref) => ContactListNotifier(
    repository: ref.read(contactRepositoryProvider),
  ),
);

class ContactListNotifier extends StateNotifier<ContactListState> {
  final ContactRepository _repository;

  ContactListNotifier({required ContactRepository repository})
      : _repository = repository,
        super(const ContactListState());

  Future<void> loadContacts({bool refresh = false}) async {
    if (state.status == ContactListStatus.loading) return;

    state = state.copyWith(
      status: ContactListStatus.loading,
      contacts: refresh ? [] : state.contacts,
    );

    try {
      final response = await _repository.getContacts(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        type: state.typeFilter,
        source: state.sourceFilter,
        city: state.cityFilter,
        country: state.countryFilter,
        tag: state.tagFilter,
        language: state.languageFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: ContactListStatus.loaded,
        contacts: response.data,
        pagination: response.pagination,
        selectedIds: {},
      );
    } catch (e) {
      state = state.copyWith(
        status: ContactListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == ContactListStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: ContactListStatus.loading);

    try {
      final response = await _repository.getContacts(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        type: state.typeFilter,
        source: state.sourceFilter,
        city: state.cityFilter,
        country: state.countryFilter,
        tag: state.tagFilter,
        language: state.languageFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: ContactListStatus.loaded,
        contacts: [...state.contacts, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: ContactListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadContacts(refresh: true);
  }

  void setFilter({
    String? type,
    String? source,
    String? city,
    String? country,
    String? tag,
    String? language,
  }) {
    state = state.copyWith(
      typeFilter: type,
      sourceFilter: source,
      cityFilter: city,
      countryFilter: country,
      tagFilter: tag,
      languageFilter: language,
    );
    loadContacts(refresh: true);
  }

  /// Explicitly sets (or clears) the type filter. Handles null correctly
  /// unlike [setFilter], where `copyWith` swallows null via `??`.
  void setTypeFilter(String? type) {
    state = ContactListState(
      status: state.status,
      contacts: state.contacts,
      pagination: state.pagination,
      search: state.search,
      typeFilter: type,
      sourceFilter: state.sourceFilter,
      cityFilter: state.cityFilter,
      countryFilter: state.countryFilter,
      tagFilter: state.tagFilter,
      languageFilter: state.languageFilter,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      selectedIds: state.selectedIds,
    );
    loadContacts(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(clearFilters: true, search: '');
    loadContacts(refresh: true);
  }

  void setSort(String sortBy, String sortOrder) {
    state = state.copyWith(sortBy: sortBy, sortOrder: sortOrder);
    loadContacts(refresh: true);
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
      selectedIds: state.contacts.map((c) => c.id).toSet(),
    );
  }

  void clearSelection() {
    state = state.copyWith(selectedIds: {});
  }

  Future<void> deleteContact(String id) async {
    try {
      await _repository.deleteContact(id);
      state = state.copyWith(
        contacts: state.contacts.where((c) => c.id != id).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  Future<void> bulkTag({
    required List<String> tags,
    required String action,
  }) async {
    try {
      await _repository.bulkTag(
        contactIds: state.selectedIds.toList(),
        tags: tags,
        action: action,
      );
      state = state.copyWith(selectedIds: {});
      await loadContacts(refresh: true);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Something went wrong. Please try again.';
  }
}

// ── Contact Detail Provider (family — one per contactId) ────

final contactDetailProvider = StateNotifierProvider.family<
    ContactDetailNotifier, ContactDetailState, String>(
  (ref, contactId) => ContactDetailNotifier(
    contactId: contactId,
    repository: ref.read(contactRepositoryProvider),
  ),
);

class ContactDetailNotifier extends StateNotifier<ContactDetailState> {
  final String _contactId;
  final ContactRepository _repository;

  ContactDetailNotifier({
    required String contactId,
    required ContactRepository repository,
  })  : _contactId = contactId,
        _repository = repository,
        super(const ContactDetailState());

  Future<void> load() async {
    state = state.copyWith(status: ContactDetailStatus.loading);

    try {
      final contact = await _repository.getContact(_contactId);
      state = state.copyWith(
        status: ContactDetailStatus.loaded,
        contact: contact,
      );
    } catch (e) {
      state = state.copyWith(
        status: ContactDetailStatus.error,
        error: e is ApiException ? e.message : 'Failed to load contact',
      );
    }
  }

  Future<void> loadTimeline() async {
    try {
      final timeline = await _repository.getTimeline(_contactId);
      state = state.copyWith(timeline: timeline);
    } catch (_) {
      // Non-critical — timeline can fail silently
    }
  }
}

// ── Simple Async Providers ──────────────────────────────────

final contactTagsProvider = FutureProvider<List<String>>((ref) {
  return ref.read(contactRepositoryProvider).getTags();
});

final contactFilterOptionsProvider = FutureProvider<ContactFilterOptions>((ref) {
  return ref.read(contactRepositoryProvider).getFilterOptions();
});

final upcomingOccasionsProvider =
    FutureProvider.family<List<UpcomingOccasion>, int>((ref, days) {
  return ref.read(contactRepositoryProvider).getUpcomingOccasions(days: days);
});

final contactCustomFieldDefsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) {
  return ref.read(contactRepositoryProvider).getCustomFieldDefs();
});
