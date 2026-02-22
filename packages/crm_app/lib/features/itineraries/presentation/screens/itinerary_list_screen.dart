import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';
import '../widgets/itinerary_status_badge.dart';

// ── Screen ────────────────────────────────────────────────

class ItineraryListScreen extends ConsumerStatefulWidget {
  const ItineraryListScreen({super.key});

  @override
  ConsumerState<ItineraryListScreen> createState() =>
      _ItineraryListScreenState();
}

class _ItineraryListScreenState extends ConsumerState<ItineraryListScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  bool _isSearchOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(itineraryListProvider.notifier).loadItineraries(refresh: true);
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
      ref.read(itineraryListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(itineraryListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearchOpen
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search itineraries...',
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
                      .read(itineraryListProvider.notifier)
                      .setSearch(value.trim());
                },
              )
            : const Text('Itineraries'),
        actions: [
          IconButton(
            icon: Icon(_isSearchOpen ? Icons.close : Icons.search_rounded),
            tooltip: _isSearchOpen ? 'Close search' : 'Search',
            onPressed: () {
              setState(() {
                _isSearchOpen = !_isSearchOpen;
                if (!_isSearchOpen) {
                  _searchController.clear();
                  ref.read(itineraryListProvider.notifier).setSearch('');
                }
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Status filter chips ──
          _StatusFilterBar(
            selected: state.statusFilter,
            onSelected: (status) {
              ref.read(itineraryListProvider.notifier).setStatusFilter(status);
            },
            onClear: () {
              ref.read(itineraryListProvider.notifier).clearFilters();
            },
          ),
          const Divider(height: 1),

          // ── Body ──
          Expanded(child: _buildBody(context, state, theme)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showLeadPickerDialog(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Create Itinerary'),
      ),
    );
  }

  // ── Body builder ────────────────────────────────────────

  Widget _buildBody(
      BuildContext context, ItineraryListState state, ThemeData theme) {
    // Loading (initial)
    if (state.status == ItineraryListStatus.loading &&
        state.itineraries.isEmpty) {
      return _buildShimmerLoading(theme);
    }

    // Error (no data)
    if (state.status == ItineraryListStatus.error &&
        state.itineraries.isEmpty) {
      return _ErrorState(
        message: state.error ?? 'Failed to load itineraries',
        onRetry: () => ref
            .read(itineraryListProvider.notifier)
            .loadItineraries(refresh: true),
      );
    }

    // Empty
    if (state.itineraries.isEmpty &&
        state.status == ItineraryListStatus.loaded) {
      return _EmptyState(
        hasFilters: state.statusFilter != null,
        onClearFilters: () =>
            ref.read(itineraryListProvider.notifier).clearFilters(),
        onCreateFirst: () => _showLeadPickerDialog(context),
      );
    }

    // Responsive: table on wide screens, card list on narrow
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 840;
        if (isDesktop) {
          return _buildDesktopTable(context, state, theme);
        }
        return _buildMobileList(context, state, theme);
      },
    );
  }

  // ── Desktop table ───────────────────────────────────────

  Widget _buildDesktopTable(
      BuildContext context, ItineraryListState state, ThemeData theme) {
    return SingleChildScrollView(
      controller: _scrollController,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: WidgetStateProperty.all(
            theme.colorScheme.surfaceContainerHighest,
          ),
          showCheckboxColumn: false,
          columns: const [
            DataColumn(label: Text('Title')),
            DataColumn(label: Text('Lead')),
            DataColumn(label: Text('Version')),
            DataColumn(label: Text('Status')),
            DataColumn(label: Text('Days'), numeric: true),
            DataColumn(label: Text('Grand Total'), numeric: true),
            DataColumn(label: Text('Created By')),
            DataColumn(label: Text('Created')),
          ],
          rows: [
            ...state.itineraries.map((item) {
              return DataRow(
                onSelectChanged: (_) =>
                    context.go('/itineraries/${item.id}'),
                cells: [
                  DataCell(
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 220),
                      child: Text(
                        item.title,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  DataCell(
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 200),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.contactName ?? '-',
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w500,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (item.leadTitle != null)
                            Text(
                              item.leadTitle!,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                                fontSize: 11,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                  ),
                  DataCell(Text('v${item.version}')),
                  DataCell(ItineraryStatusBadge(status: item.status)),
                  DataCell(Text('${item.daysCount ?? 0}')),
                  DataCell(
                    Text(
                      '${item.currency} ${(item.grandTotal ?? 0).toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                  DataCell(Text(item.createdBy ?? '-')),
                  DataCell(Text(_formatDate(item.createdAt))),
                ],
              );
            }),
            // Loading indicator row
            if (state.status == ItineraryListStatus.loading &&
                state.itineraries.isNotEmpty)
              DataRow(
                cells: List.generate(
                  8,
                  (i) => i == 0
                      ? const DataCell(
                          Center(
                            child: Padding(
                              padding: EdgeInsets.all(8.0),
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        )
                      : const DataCell(SizedBox.shrink()),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ── Mobile card list ────────────────────────────────────

  Widget _buildMobileList(
      BuildContext context, ItineraryListState state, ThemeData theme) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: state.itineraries.length +
          (state.status == ItineraryListStatus.loading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= state.itineraries.length) {
          return const Padding(
            padding: EdgeInsets.all(AppTheme.spacingMd),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }

        final item = state.itineraries[index];
        return _ItineraryCard(
          item: item,
          onTap: () => context.go('/itineraries/${item.id}'),
        );
      },
    );
  }

  // ── Shimmer loading ─────────────────────────────────────

  Widget _buildShimmerLoading(ThemeData theme) {
    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: 6,
      itemBuilder: (context, index) {
        return Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(AppTheme.spacingMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ShimmerBox(
                    width: 180 + (index % 3) * 30.0,
                    height: 16,
                    theme: theme,
                  ),
                  const SizedBox(height: AppTheme.spacingSm),
                  _ShimmerBox(width: 120, height: 12, theme: theme),
                  const SizedBox(height: AppTheme.spacingSm),
                  Row(
                    children: [
                      _ShimmerBox(width: 60, height: 22, theme: theme),
                      const SizedBox(width: AppTheme.spacingSm),
                      _ShimmerBox(width: 40, height: 12, theme: theme),
                      const Spacer(),
                      _ShimmerBox(width: 80, height: 12, theme: theme),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  // ── Lead picker dialog ──────────────────────────────────

  Future<void> _showLeadPickerDialog(BuildContext ctx) async {
    final leadId = await showDialog<String>(
      context: ctx,
      builder: (_) => const _LeadPickerDialog(),
    );
    if (leadId != null && mounted) {
      context.go('/itineraries/new?leadId=$leadId');
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  String _formatDate(String? iso) {
    if (iso == null) return '-';
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ══════════════════════════════════════════════════════════
// Private widgets
// ══════════════════════════════════════════════════════════

// ── Status filter bar ─────────────────────────────────────

class _StatusFilterBar extends StatelessWidget {
  final String? selected;
  final ValueChanged<String?> onSelected;
  final VoidCallback onClear;

  const _StatusFilterBar({
    required this.selected,
    required this.onSelected,
    required this.onClear,
  });

  static const _statuses = [
    (null, 'All', Icons.list_rounded),
    ('draft', 'Draft', Icons.edit_note_rounded),
    ('sent', 'Sent', Icons.send_rounded),
    ('approved', 'Approved', Icons.check_circle_outline_rounded),
    ('rejected', 'Rejected', Icons.cancel_outlined),
    ('expired', 'Expired', Icons.timer_off_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spacingMd,
          vertical: AppTheme.spacingSm,
        ),
        children: [
          ..._statuses.map((entry) {
            final (value, label, icon) = entry;
            final isSelected = value == selected;
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                selected: isSelected,
                label: Text(label, style: const TextStyle(fontSize: 12)),
                avatar: Icon(icon, size: 16),
                onSelected: (_) => onSelected(value),
                showCheckmark: false,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            );
          }),
          if (selected != null)
            Padding(
              padding: const EdgeInsets.only(left: 2),
              child: ActionChip(
                label: const Text('Clear', style: TextStyle(fontSize: 12)),
                avatar: const Icon(Icons.clear_all, size: 16),
                onPressed: onClear,
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
        ],
      ),
    );
  }
}

// ── Mobile itinerary card ─────────────────────────────────

class _ItineraryCard extends StatelessWidget {
  final ItinerarySummary item;
  final VoidCallback onTap;

  const _ItineraryCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          child: Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title row + status badge
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacingSm),
                    ItineraryStatusBadge(status: item.status),
                  ],
                ),
                const SizedBox(height: 6),

                // Contact + lead info
                if (item.contactName != null || item.leadTitle != null)
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline_rounded,
                        size: 14,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [
                            if (item.contactName != null) item.contactName,
                            if (item.leadTitle != null) item.leadTitle,
                          ].join(' - '),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 8),

                // Bottom row: version, days, total, date
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusXs),
                      ),
                      child: Text(
                        'v${item.version}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacingSm),
                    Icon(
                      Icons.calendar_today_outlined,
                      size: 12,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 2),
                    Text(
                      '${item.daysCount ?? 0}d',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${item.currency} ${(item.grandTotal ?? 0).toStringAsFixed(0)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),

                // Created date
                Row(
                  children: [
                    Icon(
                      Icons.access_time_rounded,
                      size: 12,
                      color: theme.colorScheme.onSurfaceVariant
                          .withValues(alpha: 0.6),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _formatDate(item.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11,
                        color: theme.colorScheme.onSurfaceVariant
                            .withValues(alpha: 0.6),
                      ),
                    ),
                    if (item.createdBy != null) ...[
                      const SizedBox(width: 8),
                      Icon(
                        Icons.person_outline_rounded,
                        size: 12,
                        color: theme.colorScheme.onSurfaceVariant
                            .withValues(alpha: 0.6),
                      ),
                      const SizedBox(width: 2),
                      Flexible(
                        child: Text(
                          item.createdBy!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 11,
                            color: theme.colorScheme.onSurfaceVariant
                                .withValues(alpha: 0.6),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDate(String? iso) {
    if (iso == null) return '-';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Empty state ───────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final bool hasFilters;
  final VoidCallback onClearFilters;
  final VoidCallback onCreateFirst;

  const _EmptyState({
    required this.hasFilters,
    required this.onClearFilters,
    required this.onCreateFirst,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingXl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(AppTheme.spacingXl),
              ),
              child: const Icon(
                Icons.description_outlined,
                size: 48,
                color: Color(0xFF94A3B8),
              ),
            ),
            const SizedBox(height: AppTheme.spacingLg),
            Text(
              hasFilters
                  ? 'No itineraries match your filters'
                  : 'Create your first itinerary',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppTheme.spacingSm),
            Text(
              hasFilters
                  ? 'Try adjusting or clearing your filters'
                  : 'Start building travel plans for your leads',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppTheme.spacingLg),
            if (hasFilters)
              OutlinedButton.icon(
                onPressed: onClearFilters,
                icon: const Icon(Icons.clear_all_rounded, size: 18),
                label: const Text('Clear filters'),
              )
            else
              FilledButton.icon(
                onPressed: onCreateFirst,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Create Itinerary'),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Error state ───────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingLg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
                Icons.error_outline, size: 48, color: AppTheme.errorColor),
            const SizedBox(height: AppTheme.spacingMd),
            Text(
              message,
              style: theme.textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppTheme.spacingMd),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Shimmer placeholder box ──────────────────────────────

class _ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final ThemeData theme;

  const _ShimmerBox({
    required this.width,
    required this.height,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color:
            theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppTheme.radiusXs),
      ),
    );
  }
}

// ── Lead picker dialog ───────────────────────────────────

class _LeadPickerDialog extends ConsumerStatefulWidget {
  const _LeadPickerDialog();

  @override
  ConsumerState<_LeadPickerDialog> createState() => _LeadPickerDialogState();
}

class _LeadPickerDialogState extends ConsumerState<_LeadPickerDialog> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leadsAsync = ref.watch(leadPickerProvider(_query));

    return AlertDialog(
      title: const Text('Select a Lead'),
      content: SizedBox(
        width: 440,
        height: 400,
        child: Column(
          children: [
            TextField(
              controller: _searchCtrl,
              decoration: const InputDecoration(
                hintText: 'Search leads...',
                prefixIcon: Icon(Icons.search_rounded, size: 20),
                isDense: true,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              onChanged: (v) => setState(() => _query = v.trim()),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            Expanded(
              child: leadsAsync.when(
                loading: () => const Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                error: (e, _) => Center(
                  child: Text(
                    'Error loading leads',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.error,
                    ),
                  ),
                ),
                data: (leads) {
                  if (leads.isEmpty) {
                    return Center(
                      child: Text(
                        _query.isEmpty
                            ? 'No leads available'
                            : 'No leads matching "$_query"',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    );
                  }
                  return ListView.separated(
                    itemCount: leads.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: AppTheme.spacingXs),
                    itemBuilder: (context, i) {
                      final lead = leads[i];
                      return ListTile(
                        dense: true,
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusMd),
                        ),
                        leading: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color:
                                AppTheme.primaryColor.withValues(alpha: 0.1),
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSm),
                          ),
                          child: const Icon(
                            Icons.flight_takeoff_rounded,
                            size: 18,
                            color: AppTheme.primaryColor,
                          ),
                        ),
                        title: Text(
                          lead.title,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          lead.contactName ?? 'No contact',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        onTap: () => Navigator.pop(context, lead.id),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}
