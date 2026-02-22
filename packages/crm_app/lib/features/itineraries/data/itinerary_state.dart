import 'package:shared/shared.dart';

// ── Itinerary List State ────────────────────────────────────

enum ItineraryListStatus { initial, loading, loaded, error }

class ItineraryListState {
  final ItineraryListStatus status;
  final List<ItinerarySummary> itineraries;
  final PaginationMeta? pagination;
  final String search;
  final String? statusFilter;
  final String? leadIdFilter;
  final String? createdByFilter;
  final String sortBy;
  final String sortOrder;
  final String? error;

  const ItineraryListState({
    this.status = ItineraryListStatus.initial,
    this.itineraries = const [],
    this.pagination,
    this.search = '',
    this.statusFilter,
    this.leadIdFilter,
    this.createdByFilter,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.error,
  });

  int get currentPage => pagination?.page ?? 1;
  bool get hasMore => pagination?.hasMore ?? false;

  ItineraryListState copyWith({
    ItineraryListStatus? status,
    List<ItinerarySummary>? itineraries,
    PaginationMeta? pagination,
    String? search,
    String? statusFilter,
    String? leadIdFilter,
    String? createdByFilter,
    String? sortBy,
    String? sortOrder,
    String? error,
  }) {
    return ItineraryListState(
      status: status ?? this.status,
      itineraries: itineraries ?? this.itineraries,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      statusFilter: statusFilter,
      leadIdFilter: leadIdFilter,
      createdByFilter: createdByFilter,
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      error: error ?? this.error,
    );
  }
}

// ── Itinerary Detail State ──────────────────────────────────

enum ItineraryDetailStatus { initial, loading, loaded, saving, error }

class ItineraryDetailState {
  final ItineraryDetailStatus status;
  final ItineraryModel? itinerary;
  final String? error;

  const ItineraryDetailState({
    this.status = ItineraryDetailStatus.initial,
    this.itinerary,
    this.error,
  });

  ItineraryDetailState copyWith({
    ItineraryDetailStatus? status,
    ItineraryModel? itinerary,
    String? error,
  }) {
    return ItineraryDetailState(
      status: status ?? this.status,
      itinerary: itinerary ?? this.itinerary,
      error: error ?? this.error,
    );
  }
}

// ── Itinerary Form State (Builder) ──────────────────────────

class ItineraryFormDay {
  final String id;
  final int dayNumber;
  final String? title;
  final String? description;
  final String? city;
  final String? overnightCity;
  final List<String> images;
  final bool isFreeDay;
  final List<ItineraryFormItem> items;

  const ItineraryFormDay({
    required this.id,
    required this.dayNumber,
    this.title,
    this.description,
    this.city,
    this.overnightCity,
    this.images = const [],
    this.isFreeDay = false,
    this.items = const [],
  });

  ItineraryFormDay copyWith({
    String? id,
    int? dayNumber,
    String? title,
    String? description,
    String? city,
    String? overnightCity,
    List<String>? images,
    bool? isFreeDay,
    List<ItineraryFormItem>? items,
  }) {
    return ItineraryFormDay(
      id: id ?? this.id,
      dayNumber: dayNumber ?? this.dayNumber,
      title: title ?? this.title,
      description: description ?? this.description,
      city: city ?? this.city,
      overnightCity: overnightCity ?? this.overnightCity,
      images: images ?? this.images,
      isFreeDay: isFreeDay ?? this.isFreeDay,
      items: items ?? this.items,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'dayNumber': dayNumber,
        'title': title,
        'description': description,
        'city': city,
        'overnightCity': overnightCity,
        'images': images,
        'isFreeDay': isFreeDay,
        'items': items.map((i) => i.toJson()).toList(),
      };
}

class ItineraryFormItem {
  final String id;
  final String type;
  final String title;
  final String? description;
  final String? supplierId;
  final String? rateCardId;
  final double costPrice;
  final double sellingPrice;
  final String? markupType;
  final double? markupValue;
  final double taxRate;
  final double taxAmount;
  final int quantity;
  final String? paxType;
  final String? timeStart;
  final String? timeEnd;
  final int sortOrder;
  final Map<String, dynamic>? detailsJson;
  final String? internalNotes;

  const ItineraryFormItem({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.supplierId,
    this.rateCardId,
    this.costPrice = 0,
    this.sellingPrice = 0,
    this.markupType,
    this.markupValue,
    this.taxRate = 0,
    this.taxAmount = 0,
    this.quantity = 1,
    this.paxType,
    this.timeStart,
    this.timeEnd,
    this.sortOrder = 0,
    this.detailsJson,
    this.internalNotes,
  });

  ItineraryFormItem copyWith({
    String? id,
    String? type,
    String? title,
    String? description,
    String? supplierId,
    String? rateCardId,
    double? costPrice,
    double? sellingPrice,
    String? markupType,
    double? markupValue,
    double? taxRate,
    double? taxAmount,
    int? quantity,
    String? paxType,
    String? timeStart,
    String? timeEnd,
    int? sortOrder,
    Map<String, dynamic>? detailsJson,
    String? internalNotes,
  }) {
    return ItineraryFormItem(
      id: id ?? this.id,
      type: type ?? this.type,
      title: title ?? this.title,
      description: description ?? this.description,
      supplierId: supplierId ?? this.supplierId,
      rateCardId: rateCardId ?? this.rateCardId,
      costPrice: costPrice ?? this.costPrice,
      sellingPrice: sellingPrice ?? this.sellingPrice,
      markupType: markupType ?? this.markupType,
      markupValue: markupValue ?? this.markupValue,
      taxRate: taxRate ?? this.taxRate,
      taxAmount: taxAmount ?? this.taxAmount,
      quantity: quantity ?? this.quantity,
      paxType: paxType ?? this.paxType,
      timeStart: timeStart ?? this.timeStart,
      timeEnd: timeEnd ?? this.timeEnd,
      sortOrder: sortOrder ?? this.sortOrder,
      detailsJson: detailsJson ?? this.detailsJson,
      internalNotes: internalNotes ?? this.internalNotes,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'title': title,
        'description': description,
        'supplierId': supplierId,
        'rateCardId': rateCardId,
        'costPrice': costPrice,
        'sellingPrice': sellingPrice,
        'markupType': markupType,
        'markupValue': markupValue,
        'taxRate': taxRate,
        'taxAmount': taxAmount,
        'quantity': quantity,
        'paxType': paxType,
        'timeStart': timeStart,
        'timeEnd': timeEnd,
        'sortOrder': sortOrder,
        if (detailsJson != null) 'detailsJson': detailsJson,
        'internalNotes': internalNotes,
      };
}

enum ItineraryFormStatus { initial, loading, loaded, saving, saved, error }

class ItineraryFormState {
  final ItineraryFormStatus status;
  final String? itineraryId; // null = new
  final String? leadId;
  final String title;
  final String? validityDate;
  final String? notes;
  final List<String> inclusions;
  final List<String> exclusions;
  final String? termsConditions;
  final String currency;
  final String? markupType;
  final double? markupValue;
  final List<ItineraryFormDay> days;
  final int selectedDayIndex;
  final double totalCost;
  final double totalSelling;
  final double totalTax;
  final double grandTotal;
  final String? error;

  const ItineraryFormState({
    this.status = ItineraryFormStatus.initial,
    this.itineraryId,
    this.leadId,
    this.title = '',
    this.validityDate,
    this.notes,
    this.inclusions = const [],
    this.exclusions = const [],
    this.termsConditions,
    this.currency = 'INR',
    this.markupType,
    this.markupValue,
    this.days = const [],
    this.selectedDayIndex = 0,
    this.totalCost = 0,
    this.totalSelling = 0,
    this.totalTax = 0,
    this.grandTotal = 0,
    this.error,
  });

  bool get isNew => itineraryId == null;

  ItineraryFormState copyWith({
    ItineraryFormStatus? status,
    String? itineraryId,
    String? leadId,
    String? title,
    String? validityDate,
    String? notes,
    List<String>? inclusions,
    List<String>? exclusions,
    String? termsConditions,
    String? currency,
    String? markupType,
    double? markupValue,
    List<ItineraryFormDay>? days,
    int? selectedDayIndex,
    double? totalCost,
    double? totalSelling,
    double? totalTax,
    double? grandTotal,
    String? error,
  }) {
    return ItineraryFormState(
      status: status ?? this.status,
      itineraryId: itineraryId ?? this.itineraryId,
      leadId: leadId ?? this.leadId,
      title: title ?? this.title,
      validityDate: validityDate ?? this.validityDate,
      notes: notes ?? this.notes,
      inclusions: inclusions ?? this.inclusions,
      exclusions: exclusions ?? this.exclusions,
      termsConditions: termsConditions ?? this.termsConditions,
      currency: currency ?? this.currency,
      markupType: markupType ?? this.markupType,
      markupValue: markupValue ?? this.markupValue,
      days: days ?? this.days,
      selectedDayIndex: selectedDayIndex ?? this.selectedDayIndex,
      totalCost: totalCost ?? this.totalCost,
      totalSelling: totalSelling ?? this.totalSelling,
      totalTax: totalTax ?? this.totalTax,
      grandTotal: grandTotal ?? this.grandTotal,
      error: error ?? this.error,
    );
  }
}

// ── Rate Card State ─────────────────────────────────────────

enum RateCardListStatus { initial, loading, loaded, error }

class RateCardListState {
  final RateCardListStatus status;
  final List<RateCardModel> rateCards;
  final PaginationMeta? pagination;
  final String search;
  final String? serviceTypeFilter;
  final String? destinationFilter;
  final String? seasonFilter;
  final String? error;

  const RateCardListState({
    this.status = RateCardListStatus.initial,
    this.rateCards = const [],
    this.pagination,
    this.search = '',
    this.serviceTypeFilter,
    this.destinationFilter,
    this.seasonFilter,
    this.error,
  });

  int get currentPage => pagination?.page ?? 1;
  bool get hasMore => pagination?.hasMore ?? false;

  RateCardListState copyWith({
    RateCardListStatus? status,
    List<RateCardModel>? rateCards,
    PaginationMeta? pagination,
    String? search,
    String? serviceTypeFilter,
    String? destinationFilter,
    String? seasonFilter,
    String? error,
  }) {
    return RateCardListState(
      status: status ?? this.status,
      rateCards: rateCards ?? this.rateCards,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      serviceTypeFilter: serviceTypeFilter,
      destinationFilter: destinationFilter,
      seasonFilter: seasonFilter,
      error: error ?? this.error,
    );
  }
}
