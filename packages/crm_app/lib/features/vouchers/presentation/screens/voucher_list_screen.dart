import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/models/voucher.dart';
import '../../data/voucher_provider.dart';
import '../../data/voucher_state.dart';

class VoucherListScreen extends ConsumerStatefulWidget {
  const VoucherListScreen({super.key});

  @override
  ConsumerState<VoucherListScreen> createState() => _VoucherListScreenState();
}

class _VoucherListScreenState extends ConsumerState<VoucherListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  bool _isSearchOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(voucherListProvider.notifier).load(refresh: true);
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
      ref.read(voucherListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(voucherListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearchOpen
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search vouchers...',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  fillColor: Colors.transparent,
                  filled: true,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 0, vertical: 10),
                ),
                onChanged: (value) {
                  ref.read(voucherListProvider.notifier).setSearch(value.trim());
                },
              )
            : const Text('Vouchers'),
        actions: [
          if (!_isSearchOpen)
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              tooltip: 'Create Voucher',
              onPressed: () => _showCreateVoucherOptions(context),
            ),
          IconButton(
            icon: Icon(_isSearchOpen ? Icons.close : Icons.search_rounded),
            tooltip: _isSearchOpen ? 'Close search' : 'Search',
            onPressed: () {
              setState(() {
                _isSearchOpen = !_isSearchOpen;
                if (!_isSearchOpen) {
                  _searchController.clear();
                  ref.read(voucherListProvider.notifier).setSearch('');
                }
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter bar
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                AppFilterBar(
                  filters: const [
                    ('Draft', 'draft'),
                    ('Sent', 'sent'),
                    ('Confirmed', 'confirmed'),
                  ],
                  selectedFilter: state.statusFilter,
                  onFilterChanged: (value) {
                    ref.read(voucherListProvider.notifier).setFilter(
                          status: value as String?,
                          type: state.typeFilter,
                        );
                  },
                  onClear: () {
                    ref.read(voucherListProvider.notifier).clearFilters();
                  },
                ),
                const SizedBox(width: AppTheme.spacingMd),
                AppFilterBar(
                  filters: const [
                    ('Hotel', 'hotel'),
                    ('Transport', 'transport'),
                    ('Flight', 'flight'),
                    ('Activity', 'activity'),
                  ],
                  selectedFilter: state.typeFilter,
                  onFilterChanged: (value) {
                    ref.read(voucherListProvider.notifier).setFilter(
                          type: value as String?,
                          status: state.statusFilter,
                        );
                  },
                  onClear: () {
                    ref.read(voucherListProvider.notifier).setFilter(
                          type: null,
                          status: state.statusFilter,
                        );
                  },
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Body
          Expanded(child: _buildBody(context, state, theme)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateVoucherOptions(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Create Voucher'),
      ),
    );
  }

  void _showCreateVoucherOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.hotel),
              title: const Text('Hotel Voucher'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/vouchers/new?type=hotel');
              },
            ),
            ListTile(
              leading: const Icon(Icons.directions_car),
              title: const Text('Transport Voucher'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/vouchers/new?type=transport');
              },
            ),
            ListTile(
              leading: const Icon(Icons.flight),
              title: const Text('Flight Voucher'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/vouchers/new?type=flight');
              },
            ),
            ListTile(
              leading: const Icon(Icons.local_activity),
              title: const Text('Activity Voucher'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/vouchers/new?type=activity');
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
      BuildContext context, VoucherListState state, ThemeData theme) {
    // Loading (initial)
    if (state.status == VoucherListStatus.loading && state.vouchers.isEmpty) {
      return const AppLoading();
    }

    // Error (no data)
    if (state.status == VoucherListStatus.error && state.vouchers.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load vouchers',
        onRetry: () =>
            ref.read(voucherListProvider.notifier).load(refresh: true),
      );
    }

    // Empty
    if (state.vouchers.isEmpty && state.status == VoucherListStatus.loaded) {
      return AppEmptyState(
        title: 'No Vouchers',
        message: state.statusFilter != null || state.typeFilter != null
            ? 'No vouchers match your filters'
            : 'Create your first voucher to get started',
        icon: Icons.confirmation_number_outlined,
        actionLabel: 'Create Voucher',
        onAction: () => _showCreateVoucherOptions(context),
      );
    }

    // Voucher list using ListView
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: state.vouchers.length +
          (state.status == VoucherListStatus.loading ? 1 : 0),
      itemBuilder: (context, index) {
        // Loading indicator at the bottom
        if (index == state.vouchers.length) {
          return const Padding(
            padding: EdgeInsets.all(16.0),
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final voucher = state.vouchers[index];
        return _VoucherCard(
          voucher: voucher,
          theme: theme,
          onTap: () => context.push('/vouchers/${voucher.id}'),
        );
      },
    );
  }
}

// -----------------------------------------------------------------------
// Voucher Card Widget
// -----------------------------------------------------------------------

class _VoucherCard extends StatelessWidget {
  final Voucher voucher;
  final ThemeData theme;
  final VoidCallback onTap;

  const _VoucherCard({
    required this.voucher,
    required this.theme,
    required this.onTap,
  });

  IconData _typeIcon(String type) {
    switch (type) {
      case 'hotel':
        return Icons.hotel_outlined;
      case 'transport':
        return Icons.directions_car_outlined;
      case 'flight':
        return Icons.flight_outlined;
      case 'activity':
        return Icons.local_activity_outlined;
      default:
        return Icons.confirmation_number_outlined;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'sent':
        return Colors.blue;
      case 'confirmed':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(voucher.status);
    final createdDate = voucher.createdAt?.split('T')[0] ?? '-';

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              // Type icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  _typeIcon(voucher.type),
                  color: theme.colorScheme.primary,
                  size: 22,
                ),
              ),
              const SizedBox(width: AppTheme.spacingMd),

              // Title + Lead + Date
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      voucher.title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(Icons.person_outline,
                            size: 14, color: theme.colorScheme.outline),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            voucher.leadName ?? 'No lead',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.outline,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Icon(Icons.calendar_today_outlined,
                            size: 12, color: theme.colorScheme.outline),
                        const SizedBox(width: 4),
                        Text(
                          createdDate,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.outline,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(width: AppTheme.spacingSm),

              // Type Chip
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.secondaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  voucher.type.toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSecondaryContainer,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),

              const SizedBox(width: AppTheme.spacingSm),

              // Status Badge
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  voucher.status.toUpperCase(),
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),

              const SizedBox(width: 4),

              // Chevron
              Icon(Icons.chevron_right,
                  size: 20, color: theme.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
