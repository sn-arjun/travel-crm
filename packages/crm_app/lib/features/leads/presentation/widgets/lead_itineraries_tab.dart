import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../itineraries/data/itinerary_provider.dart';
import '../../../itineraries/data/itinerary_state.dart';
import '../../../itineraries/presentation/widgets/itinerary_status_badge.dart';

/// Shows itineraries linked to a specific lead.
class LeadItinerariesTab extends ConsumerStatefulWidget {
  final String leadId;

  const LeadItinerariesTab({super.key, required this.leadId});

  @override
  ConsumerState<LeadItinerariesTab> createState() =>
      _LeadItinerariesTabState();
}

class _LeadItinerariesTabState extends ConsumerState<LeadItinerariesTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final notifier = ref.read(itineraryListProvider.notifier);
      notifier.setLeadFilter(widget.leadId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(itineraryListProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        // ── Header row ───────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Text(
                'Itineraries',
                style: theme.textTheme.titleSmall,
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: () => context.go(
                  '/itineraries/new?leadId=${widget.leadId}',
                ),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Create'),
              ),
            ],
          ),
        ),

        const Divider(height: 1),

        // ── Content ──────────────────────────────────────
        Expanded(
          child: _buildContent(state, theme),
        ),
      ],
    );
  }

  Widget _buildContent(ItineraryListState state, ThemeData theme) {
    if (state.status == ItineraryListStatus.loading &&
        state.itineraries.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.itineraries.isEmpty) {
      return AppEmptyState(
        icon: Icons.map_outlined,
        title: 'No itineraries yet',
        subtitle: 'Create an itinerary for this lead.',
        actionLabel: 'Create Itinerary',
        onAction: () => context.go(
          '/itineraries/new?leadId=${widget.leadId}',
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: state.itineraries.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final itin = state.itineraries[index];
        return _ItineraryCard(itinerary: itin);
      },
    );
  }
}

class _ItineraryCard extends StatelessWidget {
  final ItinerarySummary itinerary;

  const _ItineraryCard({required this.itinerary});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go('/itineraries/${itinerary.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      itinerary.title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  ItineraryStatusBadge(status: itinerary.status),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (itinerary.daysCount != null) ...[
                    Icon(Icons.calendar_today_outlined,
                        size: 14,
                        color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(
                      '${itinerary.daysCount} days',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(width: 16),
                  ],
                  Icon(Icons.layers_outlined,
                      size: 14,
                      color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text(
                    'v${itinerary.version}',
                    style: theme.textTheme.bodySmall,
                  ),
                  const Spacer(),
                  if (itinerary.grandTotal != null)
                    Text(
                      '${itinerary.currency} ${itinerary.grandTotal!.toStringAsFixed(0)}',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                ],
              ),
              if (itinerary.createdAt != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Created ${_formatDate(itinerary.createdAt!)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}
