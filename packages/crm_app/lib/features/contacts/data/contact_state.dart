import 'package:shared/shared.dart';

enum ContactListStatus { initial, loading, loaded, error }
enum ContactDetailStatus { initial, loading, loaded, error }

class ContactListState {
  final ContactListStatus status;
  final List<ContactModel> contacts;
  final PaginationMeta? pagination;
  final String search;
  final String? typeFilter;
  final String? sourceFilter;
  final String? cityFilter;
  final String? countryFilter;
  final String? tagFilter;
  final String? languageFilter;
  final String sortBy;
  final String sortOrder;
  final Set<String> selectedIds;
  final String? error;

  const ContactListState({
    this.status = ContactListStatus.initial,
    this.contacts = const [],
    this.pagination,
    this.search = '',
    this.typeFilter,
    this.sourceFilter,
    this.cityFilter,
    this.countryFilter,
    this.tagFilter,
    this.languageFilter,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.selectedIds = const {},
    this.error,
  });

  ContactListState copyWith({
    ContactListStatus? status,
    List<ContactModel>? contacts,
    PaginationMeta? pagination,
    String? search,
    String? typeFilter,
    String? sourceFilter,
    String? cityFilter,
    String? countryFilter,
    String? tagFilter,
    String? languageFilter,
    String? sortBy,
    String? sortOrder,
    Set<String>? selectedIds,
    String? error,
    bool clearFilters = false,
  }) {
    return ContactListState(
      status: status ?? this.status,
      contacts: contacts ?? this.contacts,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      typeFilter: clearFilters ? null : (typeFilter ?? this.typeFilter),
      sourceFilter: clearFilters ? null : (sourceFilter ?? this.sourceFilter),
      cityFilter: clearFilters ? null : (cityFilter ?? this.cityFilter),
      countryFilter: clearFilters ? null : (countryFilter ?? this.countryFilter),
      tagFilter: clearFilters ? null : (tagFilter ?? this.tagFilter),
      languageFilter: clearFilters ? null : (languageFilter ?? this.languageFilter),
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      selectedIds: selectedIds ?? this.selectedIds,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalContacts => pagination?.total ?? 0;
}

class ContactDetailState {
  final ContactDetailStatus status;
  final ContactModel? contact;
  final List<TimelineEntry> timeline;
  final String? error;

  const ContactDetailState({
    this.status = ContactDetailStatus.initial,
    this.contact,
    this.timeline = const [],
    this.error,
  });

  ContactDetailState copyWith({
    ContactDetailStatus? status,
    ContactModel? contact,
    List<TimelineEntry>? timeline,
    String? error,
  }) {
    return ContactDetailState(
      status: status ?? this.status,
      contact: contact ?? this.contact,
      timeline: timeline ?? this.timeline,
      error: error,
    );
  }
}
