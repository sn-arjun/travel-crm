import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'invoice_repository.dart';
import 'invoice_state.dart';
import 'payment_repository.dart';

// ── Repository Providers ─────────────────────────────────────

final invoiceRepositoryProvider = Provider<InvoiceRepository>(
  (ref) => InvoiceRepository(apiClient: ref.read(apiClientProvider)),
);

final paymentRepositoryProvider = Provider<PaymentRepository>(
  (ref) => PaymentRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Invoice List Provider ────────────────────────────────────

final invoiceListProvider =
    StateNotifierProvider<InvoiceListNotifier, InvoiceListState>(
  (ref) => InvoiceListNotifier(
    repository: ref.read(invoiceRepositoryProvider),
  ),
);

class InvoiceListNotifier extends StateNotifier<InvoiceListState> {
  final InvoiceRepository _repository;

  InvoiceListNotifier({required InvoiceRepository repository})
      : _repository = repository,
        super(const InvoiceListState());

  Future<void> loadInvoices({bool refresh = false}) async {
    if (state.status == InvoiceListStatus.loading) return;

    state = state.copyWith(
      status: InvoiceListStatus.loading,
      invoices: refresh ? [] : state.invoices,
    );

    try {
      final response = await _repository.getInvoices(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        type: state.typeFilter,
        startDate: state.startDate,
        endDate: state.endDate,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      final invoices = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      // Load summary stats
      double totalOutstanding = 0;
      double totalOverdue = 0;
      double totalPaidThisMonth = 0;

      try {
        final stats = await _repository.getSummaryStats();
        totalOutstanding = (stats['totalOutstanding'] as num?)?.toDouble() ?? 0;
        totalOverdue = (stats['totalOverdue'] as num?)?.toDouble() ?? 0;
        totalPaidThisMonth =
            (stats['totalPaidThisMonth'] as num?)?.toDouble() ?? 0;
      } catch (_) {
        // Stats may fail silently
      }

      state = state.copyWith(
        status: InvoiceListStatus.loaded,
        invoices: invoices,
        pagination: pagination,
        selectedIds: {},
        totalOutstanding: totalOutstanding,
        totalOverdue: totalOverdue,
        totalPaidThisMonth: totalPaidThisMonth,
      );
    } catch (e) {
      state = state.copyWith(
        status: InvoiceListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == InvoiceListStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: InvoiceListStatus.loading);

    try {
      final response = await _repository.getInvoices(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        status: state.statusFilter,
        type: state.typeFilter,
        startDate: state.startDate,
        endDate: state.endDate,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      final invoices = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: InvoiceListStatus.loaded,
        invoices: [...state.invoices, ...invoices],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: InvoiceListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadInvoices(refresh: true);
  }

  void setStatusFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    loadInvoices(refresh: true);
  }

  void setTypeFilter(String? type) {
    state = state.copyWith(typeFilter: type);
    loadInvoices(refresh: true);
  }

  void setDateRange(DateTime? startDate, DateTime? endDate) {
    state = state.copyWith(startDate: startDate, endDate: endDate);
    loadInvoices(refresh: true);
  }

  void setSort(String sortBy, String sortOrder) {
    state = state.copyWith(sortBy: sortBy, sortOrder: sortOrder);
    loadInvoices(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(clearFilters: true, search: '');
    loadInvoices(refresh: true);
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

  Future<void> deleteInvoice(String id) async {
    try {
      await _repository.deleteInvoice(id);
      state = state.copyWith(
        invoices: state.invoices
            .where((inv) => (inv['id'] as String?) != id)
            .toList(),
      );
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  Future<void> voidInvoice(String id, {String? reason}) async {
    try {
      await _repository.voidInvoice(id, reason: reason);
      await loadInvoices(refresh: true);
    } catch (e) {
      state = state.copyWith(error: _extractError(e));
    }
  }

  String _extractError(dynamic e) {
    if (e is ApiException) return e.message;
    return 'Something went wrong. Please try again.';
  }
}

// ── Invoice Detail Provider ──────────────────────────────────

final invoiceDetailProvider = StateNotifierProvider.family<
    InvoiceDetailNotifier, InvoiceDetailState, String>(
  (ref, invoiceId) => InvoiceDetailNotifier(
    invoiceId: invoiceId,
    repository: ref.read(invoiceRepositoryProvider),
    paymentRepository: ref.read(paymentRepositoryProvider),
  ),
);

class InvoiceDetailNotifier extends StateNotifier<InvoiceDetailState> {
  final String _invoiceId;
  final InvoiceRepository _repository;
  final PaymentRepository _paymentRepository;

  InvoiceDetailNotifier({
    required String invoiceId,
    required InvoiceRepository repository,
    required PaymentRepository paymentRepository,
  })  : _invoiceId = invoiceId,
        _repository = repository,
        _paymentRepository = paymentRepository,
        super(const InvoiceDetailState());

  Future<void> load() async {
    state = state.copyWith(status: InvoiceDetailStatus.loading);

    try {
      final invoice = await _repository.getInvoice(_invoiceId);
      final payments = await _paymentRepository.getPaymentsByInvoice(_invoiceId);

      state = state.copyWith(
        status: InvoiceDetailStatus.loaded,
        invoice: invoice,
        payments: payments,
      );
    } catch (e) {
      state = state.copyWith(
        status: InvoiceDetailStatus.error,
        error: e is ApiException ? e.message : 'Failed to load invoice',
      );
    }
  }

  Future<void> recordPayment({
    required double amount,
    required String method,
    required String type,
    String? referenceNumber,
    String? notes,
    DateTime? paymentDate,
  }) async {
    try {
      final payment = await _paymentRepository.recordPayment(
        invoiceId: _invoiceId,
        amount: amount,
        method: method,
        type: type,
        referenceNumber: referenceNumber,
        notes: notes,
        paymentDate: paymentDate,
      );

      state = state.copyWith(
        payments: [...state.payments, payment],
      );

      // Reload invoice to get updated balance
      await load();
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to record payment',
      );
    }
  }

  Future<void> voidInvoice({String? reason}) async {
    try {
      await _repository.voidInvoice(_invoiceId, reason: reason);
      await load();
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to void invoice',
      );
    }
  }

  Future<void> sendInvoice({
    required String channel,
    String? email,
    String? phone,
    String? note,
  }) async {
    try {
      await _repository.sendInvoice(
        _invoiceId,
        channel: channel,
        email: email,
        phone: phone,
        note: note,
      );
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to send invoice',
      );
    }
  }
}

// ── Payment List Provider ────────────────────────────────────

final paymentListProvider =
    StateNotifierProvider<PaymentListNotifier, PaymentListState>(
  (ref) => PaymentListNotifier(
    repository: ref.read(paymentRepositoryProvider),
  ),
);

class PaymentListNotifier extends StateNotifier<PaymentListState> {
  final PaymentRepository _repository;

  PaymentListNotifier({required PaymentRepository repository})
      : _repository = repository,
        super(const PaymentListState());

  Future<void> loadPayments({bool refresh = false}) async {
    if (state.status == InvoiceListStatus.loading) return;

    state = state.copyWith(
      status: InvoiceListStatus.loading,
      payments: refresh ? [] : state.payments,
    );

    try {
      final response = await _repository.getPayments(
        page: 1,
        search: state.search.isEmpty ? null : state.search,
        type: state.typeFilter,
        method: state.methodFilter,
        startDate: state.startDate,
        endDate: state.endDate,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      final payments = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: InvoiceListStatus.loaded,
        payments: payments,
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: InvoiceListStatus.error,
        error: _extractError(e),
      );
    }
  }

  Future<void> loadNextPage() async {
    if (!state.hasMore || state.status == InvoiceListStatus.loading) return;

    final nextPage = state.currentPage + 1;
    state = state.copyWith(status: InvoiceListStatus.loading);

    try {
      final response = await _repository.getPayments(
        page: nextPage,
        search: state.search.isEmpty ? null : state.search,
        type: state.typeFilter,
        method: state.methodFilter,
        startDate: state.startDate,
        endDate: state.endDate,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      );

      final payments = (response['data'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final pagination = response['pagination'] != null
          ? PaginationMeta.fromJson(response['pagination'])
          : null;

      state = state.copyWith(
        status: InvoiceListStatus.loaded,
        payments: [...state.payments, ...payments],
        pagination: pagination,
      );
    } catch (e) {
      state = state.copyWith(
        status: InvoiceListStatus.error,
        error: _extractError(e),
      );
    }
  }

  void setSearch(String search) {
    state = state.copyWith(search: search);
    loadPayments(refresh: true);
  }

  void setTypeFilter(String? type) {
    state = state.copyWith(typeFilter: type);
    loadPayments(refresh: true);
  }

  void setMethodFilter(String? method) {
    state = state.copyWith(methodFilter: method);
    loadPayments(refresh: true);
  }

  void setDateRange(DateTime? startDate, DateTime? endDate) {
    state = state.copyWith(startDate: startDate, endDate: endDate);
    loadPayments(refresh: true);
  }

  void clearFilters() {
    state = state.copyWith(clearFilters: true, search: '');
    loadPayments(refresh: true);
  }

  Future<void> deletePayment(String id) async {
    try {
      await _repository.deletePayment(id);
      state = state.copyWith(
        payments:
            state.payments.where((p) => (p['id'] as String?) != id).toList(),
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
