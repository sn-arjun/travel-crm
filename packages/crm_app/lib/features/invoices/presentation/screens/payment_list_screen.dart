import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/invoice_provider.dart';
import '../../data/invoice_state.dart';

class PaymentListScreen extends ConsumerStatefulWidget {
  const PaymentListScreen({super.key});

  @override
  ConsumerState<PaymentListScreen> createState() =>
      _PaymentListScreenState();
}

class _PaymentListScreenState extends ConsumerState<PaymentListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  bool _isSearchOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(paymentListProvider.notifier).loadPayments(refresh: true);
    });
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 200) {
      ref.read(paymentListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(paymentListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearchOpen
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search payments...',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  fillColor: Colors.transparent,
                  filled: true,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 0, vertical: 10),
                ),
                onChanged: (value) {
                  ref.read(paymentListProvider.notifier).setSearch(value.trim());
                },
              )
            : const Text('Payments'),
        actions: [
          IconButton(
            icon: Icon(_isSearchOpen ? Icons.close : Icons.search_rounded),
            tooltip: _isSearchOpen ? 'Close search' : 'Search',
            onPressed: () {
              setState(() {
                _isSearchOpen = !_isSearchOpen;
                if (!_isSearchOpen) {
                  _searchController.clear();
                  ref.read(paymentListProvider.notifier).setSearch('');
                }
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter bar
          AppFilterBar(
            filters: [
              ('Bank Transfer', 'bank-transfer'),
              ('Check', 'check'),
              ('Cash', 'cash'),
              ('Card', 'card'),
              ('UPI', 'upi'),
            ],
            selectedFilter: state.methodFilter,
            onFilterChanged: (value) {
              ref.read(paymentListProvider.notifier).setMethodFilter(value);
            },
            onClear: () {
              ref.read(paymentListProvider.notifier).clearFilters();
            },
          ),

          const Divider(height: 1),

          // Body
          Expanded(child: _buildBody(context, state, theme)),
        ],
      ),
    );
  }

  Widget _buildBody(
      BuildContext context, PaymentListState state, ThemeData theme) {
    // Loading (initial)
    if (state.status == InvoiceListStatus.loading &&
        state.payments.isEmpty) {
      return const AppLoading();
    }

    // Error (no data)
    if (state.status == InvoiceListStatus.error &&
        state.payments.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load payments',
        onRetry: () => ref
            .read(paymentListProvider.notifier)
            .loadPayments(refresh: true),
      );
    }

    // Empty
    if (state.payments.isEmpty &&
        state.status == InvoiceListStatus.loaded) {
      return AppEmptyState(
        title: 'No Payments',
        message: state.methodFilter != null
            ? 'No payments match your filters'
            : 'No payments recorded yet',
        icon: Icons.payment_outlined,
      );
    }

    // Data table
    return AppSectionCard(
      child: AppDataTable<Map<String, dynamic>>(
        columns: [
          AppDataColumn(
            title: 'Invoice',
            field: 'invoiceNumber',
            sortable: true,
            width: 120,
          ),
          AppDataColumn(
            title: 'Amount',
            field: 'amount',
            width: 100,
            cellBuilder: (value) => Text(
              '${(value as Map<String, dynamic>?)?.values.first ?? 'INR'} ${(value as Map<String, dynamic>?)?.values.last?.toString() ?? '0'}',
            ),
          ),
          AppDataColumn(
            title: 'Method',
            field: 'method',
            width: 120,
          ),
          AppDataColumn(
            title: 'Type',
            field: 'type',
            width: 100,
          ),
          AppDataColumn(
            title: 'Reference',
            field: 'referenceNumber',
            width: 120,
          ),
          AppDataColumn(
            title: 'Date',
            field: 'paymentDate',
            width: 100,
            cellBuilder: (value) {
              return Text(value?.toString().split('T')[0] ?? '-');
            },
          ),
        ],
        rows: state.payments,
        rowValueFor: (row, field) {
          if (field == 'amount') {
            return {
              'currency': row['currency'] ?? 'INR',
              'amount': row['amount'] ?? 0
            };
          }
          return row[field];
        },
        pagination: state.pagination != null
            ? PaginationState(
                page: state.pagination!.page,
                pageSize: state.pagination!.pageSize,
                total: state.pagination!.total,
              )
            : null,
        onPageChanged: (page) {
          ref.read(paymentListProvider.notifier).loadNextPage();
        },
        emptyState: AppEmptyState(
          title: 'No Payments',
          message: 'No payments to display',
          icon: Icons.payment_outlined,
        ),
      ),
    );
  }
}
