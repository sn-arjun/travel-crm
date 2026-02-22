import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/forms/app_search_field.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';

class RateCardListScreen extends ConsumerStatefulWidget {
  const RateCardListScreen({super.key});

  @override
  ConsumerState<RateCardListScreen> createState() =>
      _RateCardListScreenState();
}

class _RateCardListScreenState extends ConsumerState<RateCardListScreen> {
  final _scrollController = ScrollController();

  static const _serviceTypes = [
    'hotel',
    'transport',
    'activity',
    'meal',
    'flight',
  ];

  static const _seasons = [
    'peak',
    'off_peak',
    'shoulder',
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(rateCardListProvider.notifier).loadRateCards());
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(rateCardListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(rateCardListProvider);
    final notifier = ref.read(rateCardListProvider.notifier);
    final theme = Theme.of(context);

    return Scaffold(
      body: Column(
        children: [
          // ── Search bar ─────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              0,
            ),
            child: AppSearchField(
              hint: 'Search rate cards...',
              onChanged: notifier.setSearch,
            ),
          ),

          // ── Filter chips ───────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.spacingMd,
              vertical: AppTheme.spacingSm,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  // Service type filters
                  ..._serviceTypes.map((type) {
                    final isSelected =
                        state.serviceTypeFilter == type;
                    return Padding(
                      padding: const EdgeInsets.only(
                          right: AppTheme.spacingXs),
                      child: FilterChip(
                        label: Text(_formatServiceType(type)),
                        avatar: Icon(
                          _iconForServiceType(type),
                          size: 16,
                        ),
                        selected: isSelected,
                        onSelected: (selected) {
                          notifier.setServiceTypeFilter(
                              selected ? type : null);
                        },
                      ),
                    );
                  }),
                  const SizedBox(width: AppTheme.spacingSm),
                  Container(
                    width: 1,
                    height: 24,
                    color: theme.dividerColor,
                  ),
                  const SizedBox(width: AppTheme.spacingSm),
                  // Season filters
                  ..._seasons.map((season) {
                    final isSelected = state.seasonFilter == season;
                    return Padding(
                      padding: const EdgeInsets.only(
                          right: AppTheme.spacingXs),
                      child: FilterChip(
                        label: Text(_formatSeason(season)),
                        selected: isSelected,
                        onSelected: (selected) {
                          notifier.setSeasonFilter(
                              selected ? season : null);
                        },
                      ),
                    );
                  }),
                  if (state.serviceTypeFilter != null ||
                      state.seasonFilter != null) ...[
                    const SizedBox(width: AppTheme.spacingSm),
                    ActionChip(
                      label: const Text('Clear'),
                      avatar: const Icon(Icons.clear, size: 16),
                      onPressed: notifier.clearFilters,
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── List body ──────────────────────────────────────
          Expanded(
            child: _buildBody(state, theme),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/rate-cards/new'),
        icon: const Icon(Icons.add),
        label: const Text('New Rate Card'),
      ),
    );
  }

  Widget _buildBody(RateCardListState state, ThemeData theme) {
    if (state.status == RateCardListStatus.loading &&
        state.rateCards.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.status == RateCardListStatus.error &&
        state.rateCards.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load rate cards',
        onRetry: () =>
            ref.read(rateCardListProvider.notifier).loadRateCards(),
      );
    }

    if (state.rateCards.isEmpty) {
      return const AppEmptyState(
        icon: Icons.price_change_outlined,
        title: 'No Rate Cards',
        subtitle: 'Create your first rate card to manage pricing.',
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref
          .read(rateCardListProvider.notifier)
          .loadRateCards(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(
          AppTheme.spacingMd,
          0,
          AppTheme.spacingMd,
          AppTheme.spacingXxl,
        ),
        itemCount: state.rateCards.length + (state.hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= state.rateCards.length) {
            return const Padding(
              padding: EdgeInsets.all(AppTheme.spacingMd),
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            );
          }

          final card = state.rateCards[index];
          return _RateCardTile(
            rateCard: card,
            onTap: () =>
                context.push('/rate-cards/${card.id}/edit'),
            onDelete: () => _confirmDelete(card),
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(RateCardModel card) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Rate Card',
      message:
          'Are you sure you want to delete "${card.name}"? This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );

    if (!confirmed || !mounted) return;

    try {
      final repo = ref.read(rateCardRepositoryProvider);
      await repo.deleteRateCard(card.id);
      if (!mounted) return;
      AppSnackbar.success(context, 'Rate card deleted');
      ref.read(rateCardListProvider.notifier).loadRateCards(refresh: true);
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to delete rate card');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  static IconData _iconForServiceType(String type) {
    return switch (type) {
      'hotel' => Icons.hotel,
      'transport' => Icons.directions_car,
      'activity' => Icons.hiking,
      'meal' => Icons.restaurant,
      'flight' => Icons.flight,
      _ => Icons.category_outlined,
    };
  }

  static String _formatServiceType(String type) {
    return switch (type) {
      'hotel' => 'Hotel',
      'transport' => 'Transport',
      'activity' => 'Activity',
      'meal' => 'Meal',
      'flight' => 'Flight',
      _ => type,
    };
  }

  static String _formatSeason(String season) {
    return switch (season) {
      'peak' => 'Peak',
      'off_peak' => 'Off-Peak',
      'shoulder' => 'Shoulder',
      _ => season,
    };
  }
}

// ── Rate Card Tile ──────────────────────────────────────────────

class _RateCardTile extends StatelessWidget {
  final RateCardModel rateCard;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _RateCardTile({
    required this.rateCard,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currency = rateCard.currency;

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              // Service type icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius:
                      BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(
                  _iconForServiceType(rateCard.serviceType),
                  color: AppTheme.primaryColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: AppTheme.spacingMd),

              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Name + season badge
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            rateCard.name,
                            style: theme.textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (rateCard.season != null) ...[
                          const SizedBox(width: AppTheme.spacingSm),
                          _SeasonBadge(season: rateCard.season!),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),

                    // Destination + supplier
                    Row(
                      children: [
                        if (rateCard.destination != null) ...[
                          Icon(Icons.place_outlined,
                              size: 14,
                              color:
                                  theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 2),
                          Flexible(
                            child: Text(
                              rateCard.destination!,
                              style:
                                  theme.textTheme.bodySmall?.copyWith(
                                color: theme
                                    .colorScheme.onSurfaceVariant,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                        if (rateCard.destination != null &&
                            rateCard.supplierName != null)
                          Text(
                            '  |  ',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color:
                                  theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        if (rateCard.supplierName != null)
                          Flexible(
                            child: Text(
                              rateCard.supplierName!,
                              style:
                                  theme.textTheme.bodySmall?.copyWith(
                                color: theme
                                    .colorScheme.onSurfaceVariant,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // Prices
                    Row(
                      children: [
                        Text(
                          'Cost: ${CurrencyUtils.format(rateCard.costPrice, currency: currency)}',
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        if (rateCard.sellingPrice != null)
                          Text(
                            'Sell: ${CurrencyUtils.format(rateCard.sellingPrice!, currency: currency)}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppTheme.successColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                      ],
                    ),

                    // Validity dates
                    if (rateCard.validFrom != null ||
                        rateCard.validTo != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        _validityRange(
                            rateCard.validFrom, rateCard.validTo),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              // Delete button
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                color: theme.colorScheme.onSurfaceVariant,
                tooltip: 'Delete',
                onPressed: onDelete,
              ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _iconForServiceType(String type) {
    return switch (type) {
      'hotel' => Icons.hotel,
      'transport' => Icons.directions_car,
      'activity' => Icons.hiking,
      'meal' => Icons.restaurant,
      'flight' => Icons.flight,
      _ => Icons.category_outlined,
    };
  }

  static String _validityRange(String? from, String? to) {
    if (from != null && to != null) {
      return 'Valid: ${_shortDate(from)} - ${_shortDate(to)}';
    }
    if (from != null) return 'Valid from: ${_shortDate(from)}';
    if (to != null) return 'Valid till: ${_shortDate(to)}';
    return '';
  }

  static String _shortDate(String isoDate) {
    try {
      final d = DateTime.parse(isoDate);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return isoDate;
    }
  }
}

// ── Season Badge ────────────────────────────────────────────────

class _SeasonBadge extends StatelessWidget {
  final String season;

  const _SeasonBadge({required this.season});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (Color color, String label) = switch (season.toLowerCase()) {
      'peak' => (AppTheme.hotColor, 'Peak'),
      'off_peak' => (AppTheme.coldColor, 'Off-Peak'),
      'shoulder' => (AppTheme.warmColor, 'Shoulder'),
      _ => (Colors.grey, season),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 10,
        ),
      ),
    );
  }
}
