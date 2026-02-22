import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_responsive_builder.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';
import '../widgets/day_detail_panel.dart';
import '../widgets/day_list_panel.dart';
import '../widgets/inclusions_exclusions_editor.dart';
import '../widgets/price_summary_bar.dart';
import '../widgets/terms_editor.dart';

/// Main itinerary builder screen (TICKET-086).
///
/// Provides a responsive day-wise itinerary editing experience with
/// auto-save, drag-and-drop day reordering, item management, and a
/// real-time price summary bar.
class ItineraryBuilderScreen extends ConsumerStatefulWidget {
  /// Pass [leadId] when creating a new itinerary for a lead.
  final String? leadId;

  /// Pass [itineraryId] when editing an existing itinerary.
  final String? itineraryId;

  const ItineraryBuilderScreen({
    super.key,
    this.leadId,
    this.itineraryId,
  });

  @override
  ConsumerState<ItineraryBuilderScreen> createState() =>
      _ItineraryBuilderScreenState();
}

class _ItineraryBuilderScreenState
    extends ConsumerState<ItineraryBuilderScreen>
    with SingleTickerProviderStateMixin {
  final _titleController = TextEditingController();
  Timer? _autoSaveTimer;
  late TabController _tabController;

  bool get _isEdit => widget.itineraryId != null;

  // ── Lifecycle ──────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final notifier = ref.read(itineraryFormProvider.notifier);
      if (_isEdit) {
        notifier.initFromItinerary(widget.itineraryId!);
      } else {
        notifier.initNew(widget.leadId ?? '');
      }
    });

    _startAutoSave();
  }

  @override
  void dispose() {
    _autoSaveTimer?.cancel();
    _titleController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  // ── Auto-save ─────────────────────────────────────────────

  void _startAutoSave() {
    _autoSaveTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      final formState = ref.read(itineraryFormProvider);
      if (formState.status == ItineraryFormStatus.loaded &&
          formState.title.isNotEmpty &&
          formState.days.isNotEmpty) {
        _save(silent: true);
      }
    });
  }

  Future<void> _save({bool silent = false}) async {
    final formState = ref.read(itineraryFormProvider);

    // Validation
    if (formState.title.isEmpty) {
      if (!silent) AppSnackbar.error(context, 'Title is required');
      return;
    }
    if (formState.days.isEmpty) {
      if (!silent) AppSnackbar.error(context, 'At least 1 day is required');
      return;
    }

    final id = await ref.read(itineraryFormProvider.notifier).save();

    if (!mounted) return;

    if (id != null) {
      if (!silent) {
        AppSnackbar.success(context, 'Itinerary saved');
      }
    } else {
      final error = ref.read(itineraryFormProvider).error;
      if (!silent) {
        AppSnackbar.error(context, error ?? 'Failed to save itinerary');
      }
    }
  }

  // ── Sync title controller ─────────────────────────────────

  void _syncTitleController(ItineraryFormState formState) {
    if (_titleController.text != formState.title) {
      _titleController.text = formState.title;
      _titleController.selection = TextSelection.fromPosition(
        TextPosition(offset: _titleController.text.length),
      );
    }
  }

  // ── Build ─────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final formState = ref.watch(itineraryFormProvider);
    final theme = Theme.of(context);

    // Keep title controller in sync when loading from server
    if (formState.status == ItineraryFormStatus.loaded &&
        _titleController.text.isEmpty &&
        formState.title.isNotEmpty) {
      _syncTitleController(formState);
    }

    if (formState.status == ItineraryFormStatus.loading ||
        formState.status == ItineraryFormStatus.initial) {
      return Scaffold(
        appBar: AppBar(title: const Text('Itinerary Builder')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: _buildAppBar(formState, theme),
      body: Column(
        children: [
          // Title field
          _buildTitleField(theme),

          // Main content area
          Expanded(
            child: _buildBodyLayout(formState),
          ),

          // Price summary bar
          PriceSummaryBar(
            totalCost: formState.totalCost,
            totalSelling: formState.totalSelling,
            totalTax: formState.totalTax,
            grandTotal: formState.grandTotal,
            currency: formState.currency,
            showCost: true,
          ),
        ],
      ),
    );
  }

  // ── AppBar ────────────────────────────────────────────────

  PreferredSizeWidget _buildAppBar(
    ItineraryFormState formState,
    ThemeData theme,
  ) {
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.arrow_back),
        onPressed: () => context.pop(),
      ),
      title: Text(_isEdit ? 'Edit Itinerary' : 'New Itinerary'),
      actions: [
        if (formState.status == ItineraryFormStatus.saving)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
            child: Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else ...[
          TextButton.icon(
            icon: const Icon(Icons.save_outlined, size: 18),
            label: const Text('Save'),
            onPressed: () => _save(),
          ),
        ],
      ],
    );
  }

  // ── Title field ───────────────────────────────────────────

  Widget _buildTitleField(ThemeData theme) {
    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: TextField(
        controller: _titleController,
        decoration: const InputDecoration(
          hintText: 'Itinerary Title *',
          border: OutlineInputBorder(),
        ),
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
        onChanged: (value) {
          ref.read(itineraryFormProvider.notifier).setTitle(value);
        },
      ),
    );
  }

  // ── Body layout (responsive) ──────────────────────────────

  Widget _buildBodyLayout(ItineraryFormState formState) {
    return AppResponsiveBuilder(
      mobile: _buildMobileLayout(formState),
      desktop: _buildDesktopLayout(formState),
    );
  }

  // ── Desktop: side-by-side ─────────────────────────────────

  Widget _buildDesktopLayout(ItineraryFormState formState) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Day list panel (left, 280px)
        SizedBox(
          width: 280,
          child: DayListPanel(
            days: formState.days,
            selectedIndex: formState.selectedDayIndex,
            onDaySelected: (index) {
              ref.read(itineraryFormProvider.notifier).selectDay(index);
            },
            onAddDay: () {
              ref.read(itineraryFormProvider.notifier).addDay();
            },
            onRemoveDay: (index) async {
              final confirmed = await _confirmRemoveDay();
              if (confirmed) {
                ref.read(itineraryFormProvider.notifier).removeDay(index);
              }
            },
            onReorder: (oldIndex, newIndex) {
              ref
                  .read(itineraryFormProvider.notifier)
                  .reorderDays(oldIndex, newIndex);
            },
            onDayUpdated: (day) {
              ref.read(itineraryFormProvider.notifier).updateDay(day);
            },
          ),
        ),

        const VerticalDivider(width: 1),

        // Day detail (right, expanded) + tabs
        Expanded(
          child: _buildDetailWithTabs(formState),
        ),
      ],
    );
  }

  // ── Mobile: stacked ───────────────────────────────────────

  Widget _buildMobileLayout(ItineraryFormState formState) {
    return Column(
      children: [
        // Horizontal scrollable day chips
        _buildMobileDayChips(formState),

        const Divider(height: 1),

        // Day detail + tabs
        Expanded(
          child: _buildDetailWithTabs(formState),
        ),
      ],
    );
  }

  Widget _buildMobileDayChips(ItineraryFormState formState) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingSm,
        vertical: AppTheme.spacingXs,
      ),
      child: Row(
        children: [
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: formState.days.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: AppTheme.spacingXs),
              itemBuilder: (context, index) {
                final day = formState.days[index];
                final isSelected = index == formState.selectedDayIndex;
                return ChoiceChip(
                  label: Text(day.title ?? 'Day ${day.dayNumber}'),
                  selected: isSelected,
                  onSelected: (_) {
                    ref.read(itineraryFormProvider.notifier).selectDay(index);
                  },
                );
              },
            ),
          ),
          const SizedBox(width: AppTheme.spacingXs),
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () {
              ref.read(itineraryFormProvider.notifier).addDay();
            },
            tooltip: 'Add Day',
          ),
        ],
      ),
    );
  }

  // ── Detail + Tabs ─────────────────────────────────────────

  Widget _buildDetailWithTabs(ItineraryFormState formState) {
    final selectedDay = formState.days.isNotEmpty &&
            formState.selectedDayIndex < formState.days.length
        ? formState.days[formState.selectedDayIndex]
        : null;

    return Column(
      children: [
        // Tab bar
        TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Items'),
            Tab(text: 'Inclusions / Exclusions'),
            Tab(text: 'Terms & Conditions'),
          ],
        ),

        // Tab content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              // Items tab
              selectedDay != null
                  ? DayDetailPanel(
                      dayIndex: formState.selectedDayIndex,
                    )
                  : const Center(child: Text('No day selected')),

              // Inclusions / Exclusions tab
              InclusionsExclusionsEditor(
                inclusions: formState.inclusions,
                exclusions: formState.exclusions,
                onAddInclusion: (item) {
                  ref.read(itineraryFormProvider.notifier).addInclusion(item);
                },
                onRemoveInclusion: (item) {
                  ref
                      .read(itineraryFormProvider.notifier)
                      .removeInclusion(item);
                },
                onAddExclusion: (item) {
                  ref.read(itineraryFormProvider.notifier).addExclusion(item);
                },
                onRemoveExclusion: (item) {
                  ref
                      .read(itineraryFormProvider.notifier)
                      .removeExclusion(item);
                },
              ),

              // Terms & Conditions tab
              TermsEditor(
                termsConditions: formState.termsConditions,
                validityDate: formState.validityDate,
                onTermsChanged: (terms) {
                  ref
                      .read(itineraryFormProvider.notifier)
                      .setTermsConditions(terms);
                },
                onValidityDateChanged: (date) {
                  ref
                      .read(itineraryFormProvider.notifier)
                      .setValidityDate(date);
                },
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Confirmation dialogs ──────────────────────────────────

  Future<bool> _confirmRemoveDay() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        ),
        title: const Text('Remove Day'),
        content: const Text(
          'Are you sure you want to remove this day and all its items? '
          'This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.errorColor,
            ),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    return result ?? false;
  }
}
