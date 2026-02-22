import 'package:shared/shared.dart';

enum InvoiceListStatus { initial, loading, loaded, error }
enum InvoiceDetailStatus { initial, loading, loaded, error }

class InvoiceListState {
  final InvoiceListStatus status;
  final List<Map<String, dynamic>> invoices;
  final PaginationMeta? pagination;
  final String search;
  final String? statusFilter;
  final String? typeFilter;
  final DateTime? startDate;
  final DateTime? endDate;
  final String sortBy;
  final String sortOrder;
  final Set<String> selectedIds;
  final String? error;

  // Summary stats
  final double totalOutstanding;
  final double totalOverdue;
  final double totalPaidThisMonth;

  const InvoiceListState({
    this.status = InvoiceListStatus.initial,
    this.invoices = const [],
    this.pagination,
    this.search = '',
    this.statusFilter,
    this.typeFilter,
    this.startDate,
    this.endDate,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.selectedIds = const {},
    this.error,
    this.totalOutstanding = 0,
    this.totalOverdue = 0,
    this.totalPaidThisMonth = 0,
  });

  InvoiceListState copyWith({
    InvoiceListStatus? status,
    List<Map<String, dynamic>>? invoices,
    PaginationMeta? pagination,
    String? search,
    String? statusFilter,
    String? typeFilter,
    DateTime? startDate,
    DateTime? endDate,
    String? sortBy,
    String? sortOrder,
    Set<String>? selectedIds,
    String? error,
    double? totalOutstanding,
    double? totalOverdue,
    double? totalPaidThisMonth,
    bool clearFilters = false,
  }) {
    return InvoiceListState(
      status: status ?? this.status,
      invoices: invoices ?? this.invoices,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      statusFilter: clearFilters ? null : (statusFilter ?? this.statusFilter),
      typeFilter: clearFilters ? null : (typeFilter ?? this.typeFilter),
      startDate: clearFilters ? null : (startDate ?? this.startDate),
      endDate: clearFilters ? null : (endDate ?? this.endDate),
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      selectedIds: selectedIds ?? this.selectedIds,
      error: error,
      totalOutstanding: totalOutstanding ?? this.totalOutstanding,
      totalOverdue: totalOverdue ?? this.totalOverdue,
      totalPaidThisMonth: totalPaidThisMonth ?? this.totalPaidThisMonth,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalInvoices => pagination?.total ?? 0;
}

class InvoiceDetailState {
  final InvoiceDetailStatus status;
  final Map<String, dynamic>? invoice;
  final List<Map<String, dynamic>> payments;
  final String? error;

  const InvoiceDetailState({
    this.status = InvoiceDetailStatus.initial,
    this.invoice,
    this.payments = const [],
    this.error,
  });

  InvoiceDetailState copyWith({
    InvoiceDetailStatus? status,
    Map<String, dynamic>? invoice,
    List<Map<String, dynamic>>? payments,
    String? error,
  }) {
    return InvoiceDetailState(
      status: status ?? this.status,
      invoice: invoice ?? this.invoice,
      payments: payments ?? this.payments,
      error: error,
    );
  }

  double get balanceDue => ((invoice?['total'] as num?)?.toDouble() ?? 0) -
      ((invoice?['paidAmount'] as num?)?.toDouble() ?? 0);
}

class PaymentListState {
  final InvoiceListStatus status;
  final List<Map<String, dynamic>> payments;
  final PaginationMeta? pagination;
  final String search;
  final String? typeFilter;
  final String? methodFilter;
  final DateTime? startDate;
  final DateTime? endDate;
  final String sortBy;
  final String sortOrder;
  final String? error;

  const PaymentListState({
    this.status = InvoiceListStatus.initial,
    this.payments = const [],
    this.pagination,
    this.search = '',
    this.typeFilter,
    this.methodFilter,
    this.startDate,
    this.endDate,
    this.sortBy = 'createdAt',
    this.sortOrder = 'desc',
    this.error,
  });

  PaymentListState copyWith({
    InvoiceListStatus? status,
    List<Map<String, dynamic>>? payments,
    PaginationMeta? pagination,
    String? search,
    String? typeFilter,
    String? methodFilter,
    DateTime? startDate,
    DateTime? endDate,
    String? sortBy,
    String? sortOrder,
    String? error,
    bool clearFilters = false,
  }) {
    return PaymentListState(
      status: status ?? this.status,
      payments: payments ?? this.payments,
      pagination: pagination ?? this.pagination,
      search: search ?? this.search,
      typeFilter: clearFilters ? null : (typeFilter ?? this.typeFilter),
      methodFilter: clearFilters ? null : (methodFilter ?? this.methodFilter),
      startDate: clearFilters ? null : (startDate ?? this.startDate),
      endDate: clearFilters ? null : (endDate ?? this.endDate),
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      error: error,
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
  int get currentPage => pagination?.page ?? 1;
  int get totalPayments => pagination?.total ?? 0;
}
