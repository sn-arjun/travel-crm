import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../../exports/data/export_provider.dart';
import '../../data/invoice_provider.dart';
import '../../data/invoice_state.dart';
import '../widgets/invoice_status_badge.dart';

class InvoiceListScreen extends ConsumerStatefulWidget {
  const InvoiceListScreen({super.key});

  @override
  ConsumerState<InvoiceListScreen> createState() => _InvoiceListScreenState();
}

class _InvoiceListScreenState extends ConsumerState<InvoiceListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  bool _isSearchOpen = false;
  bool _isSelectMode = false;
  Set<int> _selectedIndices = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(invoiceListProvider.notifier).loadInvoices(refresh: true);
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
      ref.read(invoiceListProvider.notifier).loadNextPage();
    }
  }

  void _exitSelectMode() {
    setState(() {
      _isSelectMode = false;
      _selectedIndices = {};
    });
  }

  Future<void> _bulkExport() async {
    final state = ref.read(invoiceListProvider);
    final ids = _selectedIndices
        .map((i) => state.invoices[i]['id'] as String?)
        .whereType<String>()
        .toList();

    if (ids.isEmpty) return;

    if (ids.length > 50) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 50 invoices per bulk download')),
      );
      return;
    }

    try {
      await ref.read(exportProvider).startBulkInvoicesExport(ids);
      _exitSelectMode();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Bulk export started (${ids.length} invoices). Check export history for download.'),
          action: SnackBarAction(
            label: 'View',
            onPressed: () => context.push('/settings/export-history'),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(invoiceListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: _isSelectMode
            ? IconButton(
                icon: const Icon(Icons.close),
                onPressed: _exitSelectMode,
              )
            : null,
        title: _isSelectMode
            ? Text('${_selectedIndices.length} selected')
            : _isSearchOpen
                ? TextField(
                    controller: _searchController,
                    autofocus: true,
                    decoration: const InputDecoration(
                      hintText: 'Search invoices...',
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      fillColor: Colors.transparent,
                      filled: true,
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 0, vertical: 10),
                    ),
                    onChanged: (value) {
                      ref
                          .read(invoiceListProvider.notifier)
                          .setSearch(value.trim());
                    },
                  )
                : const Text('Invoices'),
        actions: _isSelectMode
            ? [
                IconButton(
                  icon: const Icon(Icons.file_download_rounded),
                  tooltip: 'Export selected',
                  onPressed:
                      _selectedIndices.isNotEmpty ? _bulkExport : null,
                ),
              ]
            : [
                IconButton(
                  icon: Icon(
                      _isSearchOpen ? Icons.close : Icons.search_rounded),
                  tooltip: _isSearchOpen ? 'Close search' : 'Search',
                  onPressed: () {
                    setState(() {
                      _isSearchOpen = !_isSearchOpen;
                      if (!_isSearchOpen) {
                        _searchController.clear();
                        ref.read(invoiceListProvider.notifier).setSearch('');
                      }
                    });
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.checklist_rounded),
                  tooltip: 'Select invoices',
                  onPressed: () {
                    setState(() {
                      _isSelectMode = true;
                      _selectedIndices = {};
                    });
                  },
                ),
              ],
      ),
      body: Column(
        children: [
          // Bulk action bar
          if (_isSelectMode && _selectedIndices.isNotEmpty)
            Container(
              color: theme.colorScheme.primaryContainer,
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.info_outline,
                      size: 18,
                      color: theme.colorScheme.onPrimaryContainer),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${_selectedIndices.length} invoice(s) selected',
                      style: TextStyle(
                          color: theme.colorScheme.onPrimaryContainer),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: _bulkExport,
                    icon: const Icon(Icons.file_download, size: 18),
                    label: const Text('Export'),
                  ),
                ],
              ),
            ),

          // Summary cards
          if (state.invoices.isNotEmpty && !_isSelectMode)
            _buildSummaryCards(context, state),

          // Status filter bar
          if (!_isSelectMode)
            AppFilterBar(
              filters: [
                ('Draft', 'draft'),
                ('Sent', 'sent'),
                ('Viewed', 'viewed'),
                ('Partial', 'partial'),
                ('Paid', 'paid'),
                ('Overdue', 'overdue'),
                ('Void', 'void'),
              ],
              selectedFilter: state.statusFilter,
              onFilterChanged: (value) {
                ref
                    .read(invoiceListProvider.notifier)
                    .setStatusFilter(value as String?);
              },
              onClear: () {
                ref.read(invoiceListProvider.notifier).clearFilters();
              },
            ),

          const Divider(height: 1),

          // Body
          Expanded(child: _buildBody(context, state, theme)),
        ],
      ),
      floatingActionButton: _isSelectMode
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push('/invoices/new'),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Create Invoice'),
            ),
    );
  }

  Widget _buildSummaryCards(BuildContext context, InvoiceListState state) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      child: Row(
        children: [
          Expanded(
            child: AppStatCard(
              title: 'Outstanding',
              value:
                  '${state.invoices.isNotEmpty ? (state.invoices[0]['currency'] ?? 'INR') : 'INR'} ${state.totalOutstanding.toStringAsFixed(0)}',
              icon: Icons.description_outlined,
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          Expanded(
            child: AppStatCard(
              title: 'Overdue',
              value:
                  '${state.invoices.isNotEmpty ? (state.invoices[0]['currency'] ?? 'INR') : 'INR'} ${state.totalOverdue.toStringAsFixed(0)}',
              icon: Icons.warning_outlined,
              isAlert: true,
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          Expanded(
            child: AppStatCard(
              title: 'Paid (This Month)',
              value:
                  '${state.invoices.isNotEmpty ? (state.invoices[0]['currency'] ?? 'INR') : 'INR'} ${state.totalPaidThisMonth.toStringAsFixed(0)}',
              icon: Icons.check_circle_outlined,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
      BuildContext context, InvoiceListState state, ThemeData theme) {
    // Loading (initial)
    if (state.status == InvoiceListStatus.loading && state.invoices.isEmpty) {
      return const AppLoading();
    }

    // Error (no data)
    if (state.status == InvoiceListStatus.error && state.invoices.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load invoices',
        onRetry: () => ref
            .read(invoiceListProvider.notifier)
            .loadInvoices(refresh: true),
      );
    }

    // Empty
    if (state.invoices.isEmpty && state.status == InvoiceListStatus.loaded) {
      return AppEmptyState(
        title: 'No Invoices',
        message: state.statusFilter != null
            ? 'No invoices match your filters'
            : 'Create your first invoice to get started',
        icon: Icons.description_outlined,
        actionLabel: 'Create Invoice',
        onAction: () => context.push('/invoices/new'),
      );
    }

    // Data table
    return AppSectionCard(
      expand: true,
      child: AppDataTable<Map<String, dynamic>>(
        selectable: _isSelectMode,
        selectedIndices: _isSelectMode ? _selectedIndices : null,
        onSelectionChanged: _isSelectMode
            ? (indices) => setState(() => _selectedIndices = indices)
            : null,
        columns: [
          AppDataColumn(
            title: 'Invoice #',
            field: 'invoiceNumber',
            sortable: true,
            width: 100,
          ),
          AppDataColumn(
            title: 'Contact',
            field: 'contactName',
            width: 150,
          ),
          AppDataColumn(
            title: 'Amount',
            field: 'total',
            width: 100,
            cellBuilder: (value) {
              return Text(
                '${(value as Map<String, dynamic>?)?.values.first ?? 'INR'} ${(value)?.values.last?.toString().split('.')[0] ?? '0'}',
              );
            },
          ),
          AppDataColumn(
            title: 'Status',
            field: 'status',
            width: 150,
            cellBuilder: (value) {
              final inv = state.invoices.firstWhere(
                  (i) => (i['id'] as String?) == value,
                  orElse: () => {});
              return InvoiceStatusBadge(
                status: (inv['status'] as String?) ?? 'draft',
                type: (inv['type'] as String?) ?? 'invoice',
              );
            },
          ),
          AppDataColumn(
            title: 'Date',
            field: 'invoiceDate',
            width: 100,
            cellBuilder: (value) {
              return Text(value?.toString().split('T')[0] ?? '-');
            },
          ),
        ],
        rows: state.invoices,
        rowValueFor: (row, field) {
          if (field == 'total') {
            return {
              'currency': row['currency'] ?? 'INR',
              'amount': row['total'] ?? 0
            };
          }
          return row[field];
        },
        onRowTap: _isSelectMode
            ? null
            : (index) {
                final invoiceId = state.invoices[index]['id'] as String?;
                if (invoiceId != null) {
                  context.push('/invoices/$invoiceId');
                }
              },
        pagination: state.pagination != null
            ? PaginationState(
                page: state.pagination!.page,
                pageSize: state.pagination!.limit,
                total: state.pagination!.total,
              )
            : null,
        onPageChanged: (page) {
          ref.read(invoiceListProvider.notifier).loadNextPage();
        },
        emptyState: AppEmptyState(
          title: 'No Invoices',
          message: 'No invoices to display',
          icon: Icons.description_outlined,
        ),
      ),
    );
  }
}
