import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import '../../data/models/supplier.dart';
import '../../data/models/supplier_rate_card.dart';
import '../../data/models/ledger_entry.dart';
import '../../data/repositories/supplier_repository.dart';

part 'supplier_provider.freezed.dart';

// ============================================================================
// SUPPLIER LIST STATE & NOTIFIER
// ============================================================================

@freezed
abstract class SupplierListState with _$SupplierListState {
  const factory SupplierListState({
    @Default([]) List<Supplier> suppliers,
    @Default(true) bool isLoading,
    String? error,
    @Default(1) int currentPage,
    @Default(1) int totalPages,
    @Default(0) int totalItems,
    String? searchSubject,
    String? categoryFilter,
    String? statusFilter,
  }) = _SupplierListState;
}

class SupplierListNotifier extends StateNotifier<SupplierListState> {
  final SupplierRepository _repository;

  SupplierListNotifier(this._repository) : super(const SupplierListState()) {
    loadSuppliers();
  }

  Future<void> loadSuppliers({bool refresh = false}) async {
    if (!refresh && state.isLoading && state.suppliers.isNotEmpty) return;

    if (refresh) {
      state = state.copyWith(currentPage: 1, isLoading: true, error: null);
    } else {
      state = state.copyWith(isLoading: true, error: null);
    }

    try {
      final response = await _repository.getSuppliers(
        page: state.currentPage,
        limit: 20,
        search: state.searchSubject,
        category: state.categoryFilter,
        status: state.statusFilter,
      );

      final totalPages = response.pagination?.totalPages ?? 1;
      final newSuppliers = refresh 
          ? response.data 
          : [...state.suppliers, ...(response.data as Iterable<Supplier>)];

      state = state.copyWith(
        suppliers: newSuppliers,
        totalPages: totalPages == 0 ? 1 : totalPages,
        totalItems: response.pagination?.total ?? 0,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  void loadNextPage() {
    if (!state.isLoading && state.currentPage < state.totalPages) {
      state = state.copyWith(currentPage: state.currentPage + 1);
      loadSuppliers();
    }
  }

  void updateFilters({String? search, String? category, String? status}) {
    state = state.copyWith(
      searchSubject: search ?? state.searchSubject,
      categoryFilter: category ?? state.categoryFilter,
      statusFilter: status ?? state.statusFilter,
    );
    loadSuppliers(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(
      searchSubject: null,
      categoryFilter: null,
      statusFilter: null,
    );
    loadSuppliers(refresh: true);
  }

  Future<void> deleteSupplier(String id) async {
    try {
      await _repository.deleteSupplier(id);
      loadSuppliers(refresh: true);
    } catch (e) {
      throw Exception('Failed to delete supplier: $e');
    }
  }
}

final supplierListProvider =
    StateNotifierProvider<SupplierListNotifier, SupplierListState>((ref) {
  final repository = ref.watch(supplierRepositoryProvider);
  return SupplierListNotifier(repository);
});

// ============================================================================
// SUPPLIER DETAIL STATE & NOTIFIER
// ============================================================================

@freezed
abstract class SupplierDetailState with _$SupplierDetailState {
  const factory SupplierDetailState({
    Supplier? supplier,
    @Default([]) List<SupplierRateCard> rateCards,
    @Default([]) List<LedgerEntry> ledgerEntries,
    @Default(true) bool isLoading,
    String? error,
    @Default(0.0) double totalPaid,
  }) = _SupplierDetailState;
}

class SupplierDetailNotifier extends StateNotifier<SupplierDetailState> {
  final SupplierRepository _repository;
  final String _supplierId;

  SupplierDetailNotifier(this._repository, this._supplierId)
      : super(const SupplierDetailState()) {
    loadDetails();
  }

  Future<void> loadDetails() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final supplierFuture = _repository.getSupplier(_supplierId);
      final rateCardsFuture = _repository.getSupplierRateCards(_supplierId);
      final ledgerFuture = _repository.getSupplierLedger(_supplierId);

      final results = await Future.wait([supplierFuture, rateCardsFuture, ledgerFuture]);

      state = state.copyWith(
        supplier: results[0] as Supplier,
        rateCards: results[1] as List<SupplierRateCard>,
        ledgerEntries: results[2] as List<LedgerEntry>,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  Future<void> togglePreferred() async {
    try {
      final isPreferred = await _repository.togglePreferred(_supplierId);
      if (state.supplier != null) {
        state = state.copyWith(
          supplier: state.supplier!.copyWith(isPreferred: isPreferred),
        );
      }
    } catch (e) {
      throw Exception('Failed to toggle preferred status: $e');
    }
  }

  Future<void> recordPayment(Map<String, dynamic> data) async {
    try {
      await _repository.recordPayment(_supplierId, data);
      await loadDetails(); // Reload ledger and supplier stats
    } catch (e) {
      throw Exception('Failed to record payment: $e');
    }
  }

  Future<void> fetchRateCards() async {
    try {
      final rateCards = await _repository.getSupplierRateCards(_supplierId);
      state = state.copyWith(rateCards: rateCards);
    } catch (e) {
        // ignore
    }
  }
}

final supplierDetailProvider = StateNotifierProvider.family<
    SupplierDetailNotifier, SupplierDetailState, String>((ref, id) {
  final repository = ref.watch(supplierRepositoryProvider);
  return SupplierDetailNotifier(repository, id);
});
