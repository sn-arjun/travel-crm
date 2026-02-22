import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/itinerary_provider.dart';

/// Browse and use itinerary templates.
///
/// Displays a searchable, filterable grid/list of template cards.
/// Tapping a template opens a dialog with options to "Use Template"
/// (creates an itinerary from the template and navigates to the builder)
/// or "View Details" (shows full template information in a bottom sheet).
class TemplateBrowserScreen extends ConsumerStatefulWidget {
  /// When provided, "Use Template" will create an itinerary for this lead.
  final String? leadId;

  const TemplateBrowserScreen({super.key, this.leadId});

  @override
  ConsumerState<TemplateBrowserScreen> createState() =>
      _TemplateBrowserScreenState();
}

class _TemplateBrowserScreenState
    extends ConsumerState<TemplateBrowserScreen> {
  String _search = '';
  String? _destinationFilter;
  String? _categoryFilter;
  bool _isGridView = true;

  // Unique destinations and categories extracted from loaded templates.
  Set<String> _destinations = {};
  Set<String> _categories = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadTemplates());
  }

  void _loadTemplates() {
    ref.read(templateListProvider.notifier).loadTemplates(
          search: _search.isNotEmpty ? _search : null,
          destination: _destinationFilter,
          category: _categoryFilter,
        );
  }

  void _onSearchChanged(String value) {
    setState(() => _search = value);
    _loadTemplates();
  }

  void _setDestinationFilter(String? value) {
    setState(() => _destinationFilter = value);
    _loadTemplates();
  }

  void _setCategoryFilter(String? value) {
    setState(() => _categoryFilter = value);
    _loadTemplates();
  }

  void _extractFiltersFromTemplates(List<ItineraryTemplateModel> templates) {
    _destinations = templates
        .where((t) => t.destination != null && t.destination!.isNotEmpty)
        .map((t) => t.destination!)
        .toSet();
    _categories = templates
        .where((t) => t.category != null && t.category!.isNotEmpty)
        .map((t) => t.category!)
        .toSet();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(templateListProvider);
    final theme = Theme.of(context);

    // Extract filter options when templates are loaded.
    if (state.status == TemplateListStatus.loaded) {
      _extractFiltersFromTemplates(state.templates);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Templates'),
        actions: [
          IconButton(
            icon: Icon(
              _isGridView
                  ? Icons.view_list_outlined
                  : Icons.grid_view_outlined,
              size: 22.sp,
            ),
            tooltip: _isGridView ? 'List view' : 'Grid view',
            onPressed: () => setState(() => _isGridView = !_isGridView),
          ),
          SizedBox(width: 8.w),
        ],
      ),
      body: Column(
        children: [
          // ── Search bar ───────────────────────────────────
          Padding(
            padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search templates...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 16.w,
                  vertical: 12.h,
                ),
                suffixIcon: _search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () => _onSearchChanged(''),
                      )
                    : null,
              ),
              onChanged: _onSearchChanged,
            ),
          ),

          // ── Filter chips ─────────────────────────────────
          if (_destinations.isNotEmpty || _categories.isNotEmpty)
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: 16.w,
                vertical: 8.h,
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    // Destination chips
                    ..._destinations.map((dest) {
                      final isSelected = _destinationFilter == dest;
                      return Padding(
                        padding: EdgeInsets.only(right: 6.w),
                        child: FilterChip(
                          label: Text(dest),
                          avatar:
                              const Icon(Icons.place_outlined, size: 16),
                          selected: isSelected,
                          onSelected: (selected) {
                            _setDestinationFilter(
                                selected ? dest : null);
                          },
                        ),
                      );
                    }),
                    if (_destinations.isNotEmpty &&
                        _categories.isNotEmpty) ...[
                      SizedBox(width: 8.w),
                      Container(
                        width: 1,
                        height: 24.h,
                        color: theme.dividerColor,
                      ),
                      SizedBox(width: 8.w),
                    ],
                    // Category chips
                    ..._categories.map((cat) {
                      final isSelected = _categoryFilter == cat;
                      return Padding(
                        padding: EdgeInsets.only(right: 6.w),
                        child: FilterChip(
                          label: Text(cat),
                          avatar: const Icon(Icons.category_outlined,
                              size: 16),
                          selected: isSelected,
                          onSelected: (selected) {
                            _setCategoryFilter(selected ? cat : null);
                          },
                        ),
                      );
                    }),
                    // Clear all filters
                    if (_destinationFilter != null ||
                        _categoryFilter != null) ...[
                      SizedBox(width: 8.w),
                      ActionChip(
                        label: const Text('Clear'),
                        avatar: const Icon(Icons.clear, size: 16),
                        onPressed: () {
                          _setDestinationFilter(null);
                          _setCategoryFilter(null);
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),

          // ── Body ────────────────────────────────────────
          Expanded(child: _buildBody(state, theme)),
        ],
      ),
    );
  }

  // ── Body ────────────────────────────────────────────────

  Widget _buildBody(TemplateListState state, ThemeData theme) {
    if (state.status == TemplateListStatus.loading) {
      return const Center(child: AppLoading());
    }

    if (state.status == TemplateListStatus.error) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load templates',
        onRetry: _loadTemplates,
      );
    }

    if (state.templates.isEmpty) {
      return const AppEmptyState(
        icon: Icons.description_outlined,
        title: 'No Templates',
        subtitle:
            'No itinerary templates found. Try adjusting your search.',
      );
    }

    final templates = state.templates;

    if (_isGridView) {
      return _buildGridView(templates);
    }
    return _buildListView(templates, theme);
  }

  // ── Grid View ──────────────────────────────────────────

  Widget _buildGridView(List<ItineraryTemplateModel> templates) {
    return GridView.builder(
      padding: EdgeInsets.all(16.w),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount:
            MediaQuery.of(context).size.width > 900 ? 3 : 2,
        childAspectRatio: 1.3,
        crossAxisSpacing: 12.w,
        mainAxisSpacing: 12.h,
      ),
      itemCount: templates.length,
      itemBuilder: (context, index) {
        return _TemplateCard(
          template: templates[index],
          onTap: () => _showTemplateDialog(templates[index]),
        );
      },
    );
  }

  // ── List View ──────────────────────────────────────────

  Widget _buildListView(
      List<ItineraryTemplateModel> templates, ThemeData theme) {
    return ListView.builder(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      itemCount: templates.length,
      itemBuilder: (context, index) {
        return _TemplateListTile(
          template: templates[index],
          onTap: () => _showTemplateDialog(templates[index]),
        );
      },
    );
  }

  // ── Template dialog (Use / View Details) ───────────────

  void _showTemplateDialog(ItineraryTemplateModel template) {
    final theme = Theme.of(context);

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          ),
          title: Text(
            template.title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          content: SizedBox(
            width: 400.w,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (template.description != null &&
                    template.description!.isNotEmpty) ...[
                  Text(
                    template.description!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.7),
                    ),
                  ),
                  SizedBox(height: 16.h),
                ],
                // Info chips
                Wrap(
                  spacing: 8.w,
                  runSpacing: 8.h,
                  children: [
                    if (template.destination != null)
                      _InfoChip(
                        icon: Icons.place_outlined,
                        label: template.destination!,
                      ),
                    if (template.durationDays != null)
                      _InfoChip(
                        icon: Icons.calendar_today_outlined,
                        label: '${template.durationDays} Days',
                      ),
                    if (template.category != null)
                      _InfoChip(
                        icon: Icons.category_outlined,
                        label: template.category!,
                      ),
                    if (template.isSystem)
                      const _InfoChip(
                        icon: Icons.verified_outlined,
                        label: 'System Template',
                        color: AppTheme.infoColor,
                      ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            OutlinedButton.icon(
              icon: const Icon(Icons.visibility_outlined, size: 18),
              label: const Text('View Details'),
              onPressed: () {
                Navigator.of(ctx).pop();
                _viewTemplateDetails(template);
              },
            ),
            FilledButton.icon(
              icon: const Icon(Icons.add_circle_outline, size: 18),
              label: const Text('Use Template'),
              onPressed: () {
                Navigator.of(ctx).pop();
                _useTemplate(template);
              },
            ),
          ],
        );
      },
    );
  }

  // ── View template details ──────────────────────────────

  void _viewTemplateDetails(ItineraryTemplateModel template) {
    final theme = Theme.of(context);
    final data = template.templateData;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.radiusLg),
        ),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) {
            return Padding(
              padding: EdgeInsets.all(16.w),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      width: 40.w,
                      height: 4.h,
                      margin: EdgeInsets.only(bottom: 16.h),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Text(
                    template.title,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  if (template.description != null)
                    Text(
                      template.description!,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.7),
                      ),
                    ),
                  SizedBox(height: 16.h),

                  // Template data preview
                  Expanded(
                    child: ListView(
                      controller: scrollController,
                      children: [
                        Wrap(
                          spacing: 8.w,
                          runSpacing: 8.h,
                          children: [
                            if (template.destination != null)
                              _InfoChip(
                                icon: Icons.place_outlined,
                                label: template.destination!,
                              ),
                            if (template.durationDays != null)
                              _InfoChip(
                                icon: Icons.calendar_today_outlined,
                                label:
                                    '${template.durationDays} Days',
                              ),
                            if (template.category != null)
                              _InfoChip(
                                icon: Icons.category_outlined,
                                label: template.category!,
                              ),
                          ],
                        ),
                        SizedBox(height: 16.h),
                        if (data != null &&
                            data['days'] is List) ...[
                          Text(
                            'Day-wise Overview',
                            style:
                                theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 8.h),
                          ...(data['days'] as List)
                              .map<Widget>((dayData) {
                            final day = dayData
                                    as Map<String, dynamic>? ??
                                {};
                            final dayNum = day['dayNumber'] ?? '';
                            final title = day['title'] ?? '';
                            final city = day['city'] ?? '';
                            final itemCount =
                                (day['items'] as List?)?.length ??
                                    0;
                            return Card(
                              margin:
                                  EdgeInsets.only(bottom: 8.h),
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: AppTheme
                                      .primaryColor
                                      .withValues(alpha: 0.1),
                                  child: Text(
                                    '$dayNum',
                                    style: const TextStyle(
                                      color:
                                          AppTheme.primaryColor,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                title: Text(
                                  title.toString().isNotEmpty
                                      ? title.toString()
                                      : 'Day $dayNum',
                                ),
                                subtitle:
                                    city.toString().isNotEmpty
                                        ? Text(city.toString())
                                        : null,
                                trailing: itemCount > 0
                                    ? Container(
                                        padding:
                                            EdgeInsets.symmetric(
                                          horizontal: 8.w,
                                          vertical: 2.h,
                                        ),
                                        decoration: BoxDecoration(
                                          color: AppTheme
                                              .primaryColor
                                              .withValues(
                                                  alpha: 0.1),
                                          borderRadius:
                                              BorderRadius.circular(
                                                  AppTheme
                                                      .radiusXl),
                                        ),
                                        child: Text(
                                          '$itemCount items',
                                          style: theme
                                              .textTheme
                                              .labelSmall
                                              ?.copyWith(
                                            color: AppTheme
                                                .primaryColor,
                                          ),
                                        ),
                                      )
                                    : null,
                              ),
                            );
                          }),
                        ],
                      ],
                    ),
                  ),

                  // Use template button at the bottom
                  SizedBox(height: 8.h),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      icon: const Icon(
                          Icons.add_circle_outline, size: 18),
                      label: const Text('Use This Template'),
                      onPressed: () {
                        Navigator.of(context).pop();
                        _useTemplate(template);
                      },
                      style: FilledButton.styleFrom(
                        padding:
                            EdgeInsets.symmetric(vertical: 14.h),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  // ── Use template ───────────────────────────────────────

  Future<void> _useTemplate(ItineraryTemplateModel template) async {
    final leadId = widget.leadId;
    if (leadId == null || leadId.isEmpty) {
      if (!mounted) return;
      AppSnackbar.error(
          context, 'Please select a lead before using a template');
      return;
    }

    // Show loading indicator.
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          const Center(child: CircularProgressIndicator()),
    );

    try {
      final repo = ref.read(templateRepositoryProvider);
      final result = await repo.createFromTemplate(
        templateId: template.id,
        leadId: leadId,
        title: template.title,
      );

      if (!mounted) return;
      Navigator.of(context).pop(); // dismiss loading

      final itineraryId = result['id'] as String?;
      if (itineraryId != null) {
        AppSnackbar.success(
            context, 'Itinerary created from template');
        context.push('/itineraries/$itineraryId/edit');
      } else {
        AppSnackbar.error(
            context, 'Failed to create itinerary from template');
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop(); // dismiss loading
      final message = e is ApiException
          ? e.message
          : 'Failed to use template';
      AppSnackbar.error(context, message);
    }
  }
}

// ── Template card (grid view) ─────────────────────────────────

class _TemplateCard extends StatelessWidget {
  final ItineraryTemplateModel template;
  final VoidCallback onTap;

  const _TemplateCard({
    required this.template,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(12.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + category badge
              Row(
                children: [
                  Expanded(
                    child: Text(
                      template.title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (template.category != null) ...[
                    SizedBox(width: 4.w),
                    _CategoryBadge(category: template.category!),
                  ],
                ],
              ),
              SizedBox(height: 6.h),

              // Description
              if (template.description != null &&
                  template.description!.isNotEmpty)
                Expanded(
                  child: Text(
                    template.description!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.6),
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                )
              else
                const Spacer(),

              // Footer info row
              Row(
                children: [
                  if (template.destination != null) ...[
                    Icon(Icons.place_outlined,
                        size: 13.sp,
                        color: theme.colorScheme.onSurfaceVariant),
                    SizedBox(width: 2.w),
                    Flexible(
                      child: Text(
                        template.destination!,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                  const Spacer(),
                  if (template.durationDays != null) ...[
                    Icon(Icons.schedule_outlined,
                        size: 13.sp,
                        color: theme.colorScheme.onSurfaceVariant),
                    SizedBox(width: 2.w),
                    Text(
                      '${template.durationDays}D',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Template list tile (list view) ────────────────────────────

class _TemplateListTile extends StatelessWidget {
  final ItineraryTemplateModel template;
  final VoidCallback onTap;

  const _TemplateListTile({
    required this.template,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.only(bottom: 8.h),
      child: ListTile(
        onTap: onTap,
        contentPadding: EdgeInsets.symmetric(
          horizontal: 16.w,
          vertical: 8.h,
        ),
        leading: Container(
          width: 44.w,
          height: 44.h,
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          ),
          child: Icon(
            Icons.description_outlined,
            color: AppTheme.primaryColor,
            size: 22.sp,
          ),
        ),
        title: Text(
          template.title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (template.description != null &&
                template.description!.isNotEmpty) ...[
              SizedBox(height: 2.h),
              Text(
                template.description!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface
                      .withValues(alpha: 0.6),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            SizedBox(height: 6.h),
            Row(
              children: [
                if (template.destination != null) ...[
                  Icon(Icons.place_outlined,
                      size: 12.sp,
                      color: theme.colorScheme.onSurfaceVariant),
                  SizedBox(width: 2.w),
                  Flexible(
                    child: Text(
                      template.destination!,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  SizedBox(width: 8.w),
                ],
                if (template.durationDays != null) ...[
                  Icon(Icons.schedule_outlined,
                      size: 12.sp,
                      color: theme.colorScheme.onSurfaceVariant),
                  SizedBox(width: 2.w),
                  Text(
                    '${template.durationDays} Days',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  SizedBox(width: 8.w),
                ],
                if (template.category != null)
                  _CategoryBadge(category: template.category!),
              ],
            ),
          ],
        ),
        trailing: Icon(
          Icons.chevron_right,
          size: 20.sp,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
        ),
      ),
    );
  }
}

// ── Category Badge ──────────────────────────────────────────────

class _CategoryBadge extends StatelessWidget {
  final String category;

  const _CategoryBadge({required this.category});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _colorForCategory(category);

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
      ),
      child: Text(
        category,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 10,
        ),
      ),
    );
  }

  static Color _colorForCategory(String category) {
    return switch (category.toLowerCase()) {
      'beach' => Colors.cyan,
      'mountain' => Colors.brown,
      'heritage' => Colors.amber.shade700,
      'adventure' => Colors.deepOrange,
      'honeymoon' => Colors.pink,
      'family' => Colors.teal,
      'corporate' => Colors.indigo,
      'pilgrimage' => Colors.purple,
      'custom' => Colors.blueGrey,
      _ => Colors.grey,
    };
  }
}

// ── Info chip (used in dialogs) ───────────────────────────────

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;

  const _InfoChip({
    required this.icon,
    required this.label,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final chipColor = color ?? AppTheme.primaryColor;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 6.h),
      decoration: BoxDecoration(
        color: chipColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        border:
            Border.all(color: chipColor.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14.sp, color: chipColor),
          SizedBox(width: 4.w),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: chipColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
