import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import 'package:uuid/uuid.dart';
import '../../auth/data/auth_provider.dart';
import 'itinerary_repository.dart';
import 'itinerary_state.dart';
import 'rate_card_repository.dart';
import 'template_repository.dart';

// ── Repository Providers ────────────────────────────────────

final itineraryRepositoryProvider = Provider<ItineraryRepository>(
  (ref) => ItineraryRepository(apiClient: ref.read(apiClientProvider)),
);

final templateRepositoryProvider = Provider<TemplateRepository>(
  (ref) => TemplateRepository(apiClient: ref.read(apiClientProvider)),
);

final rateCardRepositoryProvider = Provider<RateCardRepository>(
  (ref) => RateCardRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Itinerary List Provider ─────────────────────────────────

final itineraryListProvider =
    StateNotifierProvider<ItineraryListNotifier, ItineraryListState>(
  (ref) => ItineraryListNotifier(
    repository: ref.read(itineraryRepositoryProvider),
  ),
);

class ItineraryListNotifier extends StateNotifier<ItineraryListState> {
  final ItineraryRepository _repository;

  ItineraryListNotifier({required ItineraryRepository repository})
      : _repository = repository,
        super(const ItineraryListState());

  Future<void> loadItineraries({bool refresh = false}) async {
    if (state.status == ItineraryListStatus.loading) return;

    state = state.copyWith(
      status: ItineraryListStatus.loading,
      itineraries: refresh ? [] : state.itineraries,
    );

    try {
      final response = await _repository.getItineraries(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        leadId: state.leadIdFilter,
        createdBy: state.createdByFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: ItineraryListStatus.loaded,
        itineraries: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: ItineraryListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == ItineraryListStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: ItineraryListStatus.loading);

    try {
      final response = await _repository.getItineraries(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        leadId: state.leadIdFilter,
        createdBy: state.createdByFilter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      state = state.copyWith(
        status: ItineraryListStatus.loaded,
        itineraries: [...state.itineraries, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: ItineraryListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadItineraries(refresh: true);
  }

  void setStatusFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    loadItineraries(refresh: true);
  }

  void setLeadFilter(String? leadId) {
    state = state.copyWith(leadIdFilter: leadId);
    loadItineraries(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(
      statusFilter: null,
      leadIdFilter: null,
      createdByFilter: null,
    );
    loadItineraries(refresh: true);
  }
}

// ── Itinerary Detail Provider ───────────────────────────────

final itineraryDetailProvider = StateNotifierProvider.family<
    ItineraryDetailNotifier, ItineraryDetailState, String>(
  (ref, itineraryId) => ItineraryDetailNotifier(
    itineraryId: itineraryId,
    repository: ref.read(itineraryRepositoryProvider),
  ),
);

class ItineraryDetailNotifier extends StateNotifier<ItineraryDetailState> {
  final String _itineraryId;
  final ItineraryRepository _repository;

  ItineraryDetailNotifier({
    required String itineraryId,
    required ItineraryRepository repository,
  })  : _itineraryId = itineraryId,
        _repository = repository,
        super(const ItineraryDetailState());

  Future<void> load() async {
    state = state.copyWith(status: ItineraryDetailStatus.loading);
    try {
      final itinerary = await _repository.getItinerary(_itineraryId);
      state = state.copyWith(
        status: ItineraryDetailStatus.loaded,
        itinerary: itinerary,
      );
    } catch (e) {
      state = state.copyWith(
        status: ItineraryDetailStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<bool> sendItinerary({
    required String channel,
    required String to,
    String? subject,
    String? message,
  }) async {
    state = state.copyWith(status: ItineraryDetailStatus.saving);
    try {
      await _repository.sendItinerary(
        _itineraryId,
        channel: channel,
        to: to,
        subject: subject,
        message: message,
      );
      await load();
      return true;
    } catch (e) {
      state = state.copyWith(
        status: ItineraryDetailStatus.error,
        error: _extractError(e),
      );
      return false;
    }
  }

  Future<String?> createShareLink() async {
    try {
      final result = await _repository.createShareLink(_itineraryId);
      await load();
      return result['shareUrl'] as String?;
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
      return null;
    }
  }

  Future<bool> createNewVersion() async {
    try {
      await _repository.createNewVersion(_itineraryId);
      return true;
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
      return false;
    }
  }
}

// ── Itinerary Form Provider (Builder) ───────────────────────

final itineraryFormProvider =
    StateNotifierProvider<ItineraryFormNotifier, ItineraryFormState>(
  (ref) => ItineraryFormNotifier(
    repository: ref.read(itineraryRepositoryProvider),
  ),
);

class ItineraryFormNotifier extends StateNotifier<ItineraryFormState> {
  final ItineraryRepository _repository;
  final _uuid = const Uuid();

  ItineraryFormNotifier({required ItineraryRepository repository})
      : _repository = repository,
        super(const ItineraryFormState());

  // ── Initialize ──

  void initNew(String leadId) {
    final dayId = _uuid.v4();
    state = ItineraryFormState(
      status: ItineraryFormStatus.loaded,
      leadId: leadId,
      days: [
        ItineraryFormDay(id: dayId, dayNumber: 1, title: 'Day 1'),
      ],
    );
  }

  Future<void> initFromItinerary(String itineraryId) async {
    state = state.copyWith(status: ItineraryFormStatus.loading);
    try {
      final itin = await _repository.getItinerary(itineraryId);
      state = ItineraryFormState(
        status: ItineraryFormStatus.loaded,
        itineraryId: itineraryId,
        leadId: itin.leadId,
        title: itin.title,
        validityDate: itin.validityDate,
        notes: itin.notes,
        inclusions: itin.inclusions,
        exclusions: itin.exclusions,
        termsConditions: itin.termsConditions,
        currency: itin.currency,
        markupType: itin.markupType,
        markupValue: itin.markupValue,
        days: itin.days
            .map((d) => ItineraryFormDay(
                  id: d.id,
                  dayNumber: d.dayNumber,
                  title: d.title,
                  description: d.description,
                  city: d.city,
                  overnightCity: d.overnightCity,
                  images: d.images,
                  isFreeDay: d.isFreeDay,
                  items: d.items
                      .map((i) => ItineraryFormItem(
                            id: i.id,
                            type: i.type,
                            title: i.title,
                            description: i.description,
                            supplierId: i.supplierId,
                            rateCardId: i.rateCardId,
                            costPrice: i.costPrice,
                            sellingPrice: i.sellingPrice,
                            markupType: i.markupType,
                            markupValue: i.markupValue,
                            taxRate: i.taxRate,
                            taxAmount: i.taxAmount,
                            quantity: i.quantity,
                            paxType: i.paxType,
                            timeStart: i.timeStart,
                            timeEnd: i.timeEnd,
                            sortOrder: i.sortOrder,
                            detailsJson: i.detailsJson,
                            internalNotes: i.internalNotes,
                          ))
                      .toList(),
                ))
            .toList(),
      );
      _recalculateTotals();
    } catch (e) {
      state = state.copyWith(
        status: ItineraryFormStatus.error,
        error: _extractError(e),
      );
    }
  }

  // ── Title / metadata ──

  void setTitle(String title) => state = state.copyWith(title: title);
  void setValidityDate(String? date) =>
      state = state.copyWith(validityDate: date);
  void setNotes(String? notes) => state = state.copyWith(notes: notes);
  void setCurrency(String currency) =>
      state = state.copyWith(currency: currency);
  void setMarkupType(String? type) =>
      state = state.copyWith(markupType: type);
  void setMarkupValue(double? value) {
    state = state.copyWith(markupValue: value);
    _recalculateTotals();
  }

  // ── Inclusions / Exclusions / Terms ──

  void setInclusions(List<String> items) =>
      state = state.copyWith(inclusions: items);
  void addInclusion(String item) =>
      state = state.copyWith(inclusions: [...state.inclusions, item]);
  void removeInclusion(String item) => state = state.copyWith(
      inclusions: state.inclusions.where((i) => i != item).toList());

  void setExclusions(List<String> items) =>
      state = state.copyWith(exclusions: items);
  void addExclusion(String item) =>
      state = state.copyWith(exclusions: [...state.exclusions, item]);
  void removeExclusion(String item) => state = state.copyWith(
      exclusions: state.exclusions.where((i) => i != item).toList());

  void setTermsConditions(String? terms) =>
      state = state.copyWith(termsConditions: terms);

  // ── Day management ──

  void selectDay(int index) {
    if (index >= 0 && index < state.days.length) {
      state = state.copyWith(selectedDayIndex: index);
    }
  }

  void addDay() {
    final newDay = ItineraryFormDay(
      id: _uuid.v4(),
      dayNumber: state.days.length + 1,
      title: 'Day ${state.days.length + 1}',
    );
    state = state.copyWith(
      days: [...state.days, newDay],
      selectedDayIndex: state.days.length,
    );
  }

  void removeDay(int index) {
    if (state.days.length <= 1) return;
    final updated = List<ItineraryFormDay>.from(state.days)..removeAt(index);
    // Re-number days
    final renumbered = updated.asMap().entries.map((e) {
      return e.value.copyWith(
        dayNumber: e.key + 1,
        title: e.value.title?.startsWith('Day ')  == true
            ? 'Day ${e.key + 1}'
            : e.value.title,
      );
    }).toList();

    state = state.copyWith(
      days: renumbered,
      selectedDayIndex:
          index >= renumbered.length ? renumbered.length - 1 : index,
    );
    _recalculateTotals();
  }

  void updateDay(ItineraryFormDay day) {
    final days = List<ItineraryFormDay>.from(state.days);
    final idx = days.indexWhere((d) => d.id == day.id);
    if (idx != -1) {
      days[idx] = day;
      state = state.copyWith(days: days);
    }
  }

  void reorderDays(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    final days = List<ItineraryFormDay>.from(state.days);
    final day = days.removeAt(oldIndex);
    days.insert(newIndex, day);
    // Re-number
    final renumbered = days.asMap().entries.map((e) {
      return e.value.copyWith(dayNumber: e.key + 1);
    }).toList();
    state = state.copyWith(days: renumbered);
  }

  // ── Item management ──

  void addItem(String type) {
    if (state.days.isEmpty) return;
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    final newItem = ItineraryFormItem(
      id: _uuid.v4(),
      type: type,
      title: '',
      sortOrder: day.items.length,
    );
    final updatedDay = day.copyWith(items: [...day.items, newItem]);
    final days = List<ItineraryFormDay>.from(state.days);
    days[dayIdx] = updatedDay;
    state = state.copyWith(days: days);
  }

  void removeItem(String itemId) {
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    final updatedDay = day.copyWith(
      items: day.items.where((i) => i.id != itemId).toList(),
    );
    final days = List<ItineraryFormDay>.from(state.days);
    days[dayIdx] = updatedDay;
    state = state.copyWith(days: days);
    _recalculateTotals();
  }

  void updateItem(ItineraryFormItem item) {
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    final items = List<ItineraryFormItem>.from(day.items);
    final idx = items.indexWhere((i) => i.id == item.id);
    if (idx != -1) {
      items[idx] = item;
      final updatedDay = day.copyWith(items: items);
      final days = List<ItineraryFormDay>.from(state.days);
      days[dayIdx] = updatedDay;
      state = state.copyWith(days: days);
      _recalculateTotals();
    }
  }

  void reorderItems(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    final items = List<ItineraryFormItem>.from(day.items);
    final item = items.removeAt(oldIndex);
    items.insert(newIndex, item);
    // Re-number sort order
    final renumbered = items.asMap().entries.map((e) {
      return e.value.copyWith(sortOrder: e.key);
    }).toList();
    final updatedDay = day.copyWith(items: renumbered);
    final days = List<ItineraryFormDay>.from(state.days);
    days[dayIdx] = updatedDay;
    state = state.copyWith(days: days);
  }

  // ── Image management ──

  void addImage(String imageKey) {
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    if (day.images.length >= 10) return;
    final updatedDay = day.copyWith(images: [...day.images, imageKey]);
    final days = List<ItineraryFormDay>.from(state.days);
    days[dayIdx] = updatedDay;
    state = state.copyWith(days: days);
  }

  void removeImage(String imageKey) {
    final dayIdx = state.selectedDayIndex;
    final day = state.days[dayIdx];
    final updatedDay = day.copyWith(
      images: day.images.where((i) => i != imageKey).toList(),
    );
    final days = List<ItineraryFormDay>.from(state.days);
    days[dayIdx] = updatedDay;
    state = state.copyWith(days: days);
  }

  // ── Pricing engine ──

  void _recalculateTotals() {
    double totalCost = 0;
    double totalSelling = 0;
    double totalTax = 0;

    for (final day in state.days) {
      for (final item in day.items) {
        final qty = item.quantity;
        final cost = item.costPrice * qty;
        var selling = item.sellingPrice * qty;
        final tax = selling * (item.taxRate / 100);

        totalCost += cost;
        totalSelling += selling;
        totalTax += tax;
      }
    }

    // Apply itinerary-level markup
    if (state.markupType == 'percentage' && state.markupValue != null) {
      totalSelling += totalSelling * (state.markupValue! / 100);
    } else if (state.markupType == 'fixed' && state.markupValue != null) {
      totalSelling += state.markupValue!;
    }

    state = state.copyWith(
      totalCost: totalCost,
      totalSelling: totalSelling,
      totalTax: totalTax,
      grandTotal: totalSelling + totalTax,
    );
  }

  // ── Save ──

  Future<String?> save() async {
    if (state.title.isEmpty) {
      state = state.copyWith(error: 'Title is required');
      return null;
    }
    if (state.days.isEmpty) {
      state = state.copyWith(error: 'At least one day is required');
      return null;
    }

    state = state.copyWith(status: ItineraryFormStatus.saving);

    final data = {
      'leadId': state.leadId,
      'title': state.title,
      'validityDate': state.validityDate,
      'notes': state.notes,
      'inclusions': state.inclusions,
      'exclusions': state.exclusions,
      'termsConditions': state.termsConditions,
      'currency': state.currency,
      'markupType': state.markupType,
      'markupValue': state.markupValue,
      'days': state.days.map((d) => d.toJson()).toList(),
    };

    try {
      if (state.isNew) {
        final result = await _repository.createItinerary(data);
        state = state.copyWith(
          status: ItineraryFormStatus.saved,
          itineraryId: result.id,
        );
        return result.id;
      } else {
        await _repository.updateItinerary(state.itineraryId!, data);
        state = state.copyWith(status: ItineraryFormStatus.saved);
        return state.itineraryId;
      }
    } catch (e) {
      state = state.copyWith(
        status: ItineraryFormStatus.error,
        error: _extractError(e),
      );
      return null;
    }
  }
}

// ── Rate Card List Provider ─────────────────────────────────

final rateCardListProvider =
    StateNotifierProvider<RateCardListNotifier, RateCardListState>(
  (ref) => RateCardListNotifier(
    repository: ref.read(rateCardRepositoryProvider),
  ),
);

class RateCardListNotifier extends StateNotifier<RateCardListState> {
  final RateCardRepository _repository;

  RateCardListNotifier({required RateCardRepository repository})
      : _repository = repository,
        super(const RateCardListState());

  Future<void> loadRateCards({bool refresh = false}) async {
    if (state.status == RateCardListStatus.loading) return;

    state = state.copyWith(
      status: RateCardListStatus.loading,
      rateCards: refresh ? [] : state.rateCards,
    );

    try {
      final response = await _repository.getRateCards(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        serviceType: state.serviceTypeFilter,
        destination: state.destinationFilter,
        season: state.seasonFilter,
      );

      state = state.copyWith(
        status: RateCardListStatus.loaded,
        rateCards: response.data,
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: RateCardListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == RateCardListStatus.loading) return;

    state = state.copyWith(status: RateCardListStatus.loading);
    try {
      final response = await _repository.getRateCards(
        page: state.currentPage + 1,
        search: state.search.isEmpty ? null : state.search,
        serviceType: state.serviceTypeFilter,
        destination: state.destinationFilter,
        season: state.seasonFilter,
      );

      state = state.copyWith(
        status: RateCardListStatus.loaded,
        rateCards: [...state.rateCards, ...response.data],
        pagination: response.pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: RateCardListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadRateCards(refresh: true);
  }

  void setServiceTypeFilter(String? type) {
    state = state.copyWith(serviceTypeFilter: type);
    loadRateCards(refresh: true);
  }

  void setSeasonFilter(String? season) {
    state = state.copyWith(seasonFilter: season);
    loadRateCards(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(
      serviceTypeFilter: null,
      destinationFilter: null,
      seasonFilter: null,
    );
    loadRateCards(refresh: true);
  }
}

// ── Template List Provider ──────────────────────────────────

final templateListProvider =
    StateNotifierProvider<TemplateListNotifier, TemplateListState>(
  (ref) => TemplateListNotifier(
    repository: ref.read(templateRepositoryProvider),
  ),
);

enum TemplateListStatus { initial, loading, loaded, error }

class TemplateListState {
  final TemplateListStatus status;
  final List<ItineraryTemplateModel> templates;
  final String? error;

  const TemplateListState({
    this.status = TemplateListStatus.initial,
    this.templates = const [],
    this.error,
  });

  TemplateListState copyWith({
    TemplateListStatus? status,
    List<ItineraryTemplateModel>? templates,
    String? error,
  }) {
    return TemplateListState(
      status: status ?? this.status,
      templates: templates ?? this.templates,
      error: error ?? this.error,
    );
  }
}

class TemplateListNotifier extends StateNotifier<TemplateListState> {
  final TemplateRepository _repository;

  TemplateListNotifier({required TemplateRepository repository})
      : _repository = repository,
        super(const TemplateListState());

  Future<void> loadTemplates({
    String? search,
    String? destination,
    String? category,
  }) async {
    state = state.copyWith(status: TemplateListStatus.loading);
    try {
      final response = await _repository.getTemplates(
        search: search,
        destination: destination,
        category: category,
      );
      state = state.copyWith(
        status: TemplateListStatus.loaded,
        templates: response.data,
      );
    } catch (e) {
      state = state.copyWith(
        status: TemplateListStatus.error,
        error: _extractError(e),
      );
    }
  }
}

// ── Lead Picker Provider (for creating itineraries) ─────────

final leadPickerProvider =
    FutureProvider.family.autoDispose<List<LeadModel>, String>((ref, query) async {
  final api = ref.read(apiClientProvider);
  final params = <String, dynamic>{
    'page': 1,
    'limit': 20,
    'sortBy': 'createdAt',
    'sortOrder': 'desc',
    if (query.isNotEmpty) 'search': query,
  };
  final response = await api.get(ApiEndpoints.leads, queryParameters: params);
  final list = response.data['data'] as List;
  return list.map((e) => LeadModel.fromJson(e as Map<String, dynamic>)).toList();
});

// ── RBAC: Cost Visibility (TICKET-104) ──────────────────────

/// Whether the current user can see cost prices.
/// Only admin and sales_manager roles can view cost/margin info.
final canViewCostProvider = Provider<bool>((ref) {
  final user = ref.watch(authProvider).user;
  if (user == null) return false;
  final role = user.role;
  return role == 'admin' || role == 'sales_manager';
});

// ── Helpers ─────────────────────────────────────────────────

String _extractError(dynamic e) {
  if (e is ApiException) return e.message;
  return 'Something went wrong. Please try again.';
}
