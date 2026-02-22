import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../app/theme.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';
import 'item_form.dart';

/// The item type options shown in the "Add Activity" dropdown.
const _itemTypes = <({String type, String label, IconData icon, Color color})>[
  (
    type: 'hotel',
    label: 'Hotel',
    icon: Icons.hotel,
    color: Color(0xFF7C3AED),
  ),
  (
    type: 'transport',
    label: 'Transport',
    icon: Icons.directions_car,
    color: Color(0xFF2563EB),
  ),
  (
    type: 'sightseeing',
    label: 'Sightseeing',
    icon: Icons.photo_camera,
    color: Color(0xFF0891B2),
  ),
  (
    type: 'meal',
    label: 'Meal',
    icon: Icons.restaurant,
    color: Color(0xFFD97706),
  ),
  (
    type: 'flight',
    label: 'Flight',
    icon: Icons.flight,
    color: Color(0xFFDC2626),
  ),
  (
    type: 'activity',
    label: 'Activity',
    icon: Icons.hiking,
    color: Color(0xFF059669),
  ),
  (
    type: 'other',
    label: 'Other',
    icon: Icons.category,
    color: Color(0xFF6B7280),
  ),
];

/// Right panel of the itinerary builder showing the selected day's details.
///
/// This is a [ConsumerWidget] that receives [dayIndex] and reads the
/// [itineraryFormProvider] directly to display and edit the selected day's
/// information, including text fields, images, and a reorderable item list.
class DayDetailPanel extends ConsumerWidget {
  /// The index of the day to display in the form state's days list.
  final int dayIndex;

  const DayDetailPanel({
    super.key,
    required this.dayIndex,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formState = ref.watch(itineraryFormProvider);

    // Guard: ensure dayIndex is valid
    if (dayIndex < 0 || dayIndex >= formState.days.length) {
      return Center(
        child: Text(
          'No day selected',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.5),
              ),
        ),
      );
    }

    final day = formState.days[dayIndex];

    return _DayDetailContent(
      key: ValueKey(day.id),
      day: day,
      dayIndex: dayIndex,
    );
  }
}

/// Stateful content for a single day that manages its own text controllers.
class _DayDetailContent extends ConsumerStatefulWidget {
  final ItineraryFormDay day;
  final int dayIndex;

  const _DayDetailContent({
    super.key,
    required this.day,
    required this.dayIndex,
  });

  @override
  ConsumerState<_DayDetailContent> createState() => _DayDetailContentState();
}

class _DayDetailContentState extends ConsumerState<_DayDetailContent> {
  late TextEditingController _titleCtrl;
  late TextEditingController _cityCtrl;
  late TextEditingController _overnightCityCtrl;
  late TextEditingController _descriptionCtrl;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(
        text: widget.day.title ?? 'Day ${widget.day.dayNumber}');
    _cityCtrl = TextEditingController(text: widget.day.city ?? '');
    _overnightCityCtrl =
        TextEditingController(text: widget.day.overnightCity ?? '');
    _descriptionCtrl =
        TextEditingController(text: widget.day.description ?? '');
  }

  @override
  void didUpdateWidget(covariant _DayDetailContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.day.id != widget.day.id) {
      _titleCtrl.text = widget.day.title ?? 'Day ${widget.day.dayNumber}';
      _cityCtrl.text = widget.day.city ?? '';
      _overnightCityCtrl.text = widget.day.overnightCity ?? '';
      _descriptionCtrl.text = widget.day.description ?? '';
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _cityCtrl.dispose();
    _overnightCityCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  ItineraryFormNotifier get _notifier =>
      ref.read(itineraryFormProvider.notifier);

  void _emitDayUpdate({
    String? title,
    String? city,
    String? overnightCity,
    String? description,
    bool? isFreeDay,
  }) {
    _notifier.updateDay(widget.day.copyWith(
      title: title ?? _titleCtrl.text,
      city: _cityCtrl.text.isEmpty ? null : (city ?? _cityCtrl.text),
      overnightCity: _overnightCityCtrl.text.isEmpty
          ? null
          : (overnightCity ?? _overnightCityCtrl.text),
      description: _descriptionCtrl.text.isEmpty
          ? null
          : (description ?? _descriptionCtrl.text),
      isFreeDay: isFreeDay ?? widget.day.isFreeDay,
    ));
  }

  IconData _iconForType(String type) {
    switch (type.toLowerCase()) {
      case 'hotel':
        return Icons.hotel;
      case 'transport':
        return Icons.directions_car;
      case 'sightseeing':
        return Icons.photo_camera;
      case 'activity':
        return Icons.hiking;
      case 'meal':
        return Icons.restaurant;
      case 'flight':
        return Icons.flight;
      default:
        return Icons.category;
    }
  }

  Color _colorForType(String type) {
    switch (type.toLowerCase()) {
      case 'hotel':
        return const Color(0xFF7C3AED);
      case 'transport':
        return const Color(0xFF2563EB);
      case 'sightseeing':
        return const Color(0xFF0891B2);
      case 'activity':
        return const Color(0xFF059669);
      case 'meal':
        return const Color(0xFFD97706);
      case 'flight':
        return const Color(0xFFDC2626);
      default:
        return AppTheme.primaryColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    final formState = ref.watch(itineraryFormProvider);
    final day = formState.days.length > widget.dayIndex
        ? formState.days[widget.dayIndex]
        : widget.day;
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: EdgeInsets.all(16.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Day header info ─────────────────────────────
          _buildDayHeaderSection(day, theme),

          SizedBox(height: 16.h),
          const Divider(),
          SizedBox(height: 8.h),

          // ── Description ────────────────────────────────
          Text(
            'Description',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 8.h),
          TextField(
            controller: _descriptionCtrl,
            decoration: const InputDecoration(
              hintText: 'Describe the day plan...',
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
            maxLines: 4,
            minLines: 2,
            onChanged: (_) => _emitDayUpdate(),
          ),

          SizedBox(height: 16.h),

          // ── Images section ─────────────────────────────
          _buildImagesSection(day, theme),

          SizedBox(height: 16.h),
          const Divider(),
          SizedBox(height: 8.h),

          // ── Items section ──────────────────────────────
          _buildItemsSection(day, theme),
        ],
      ),
    );
  }

  // ── Day header (title, city, overnight city, free day) ─────

  Widget _buildDayHeaderSection(ItineraryFormDay day, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Day number badge + title field + free day toggle
        Row(
          children: [
            Container(
              padding: EdgeInsets.symmetric(
                horizontal: 8.w,
                vertical: 4.h,
              ),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: Text(
                'Day ${day.dayNumber}',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
            const Spacer(),
            // Free Day toggle
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Free Day',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: day.isFreeDay
                        ? AppTheme.primaryColor
                        : theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
                SizedBox(width: 4.w),
                Switch(
                  value: day.isFreeDay,
                  onChanged: (value) {
                    _notifier.updateDay(day.copyWith(isFreeDay: value));
                  },
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ],
            ),
          ],
        ),
        SizedBox(height: 12.h),

        // Day title field
        TextField(
          controller: _titleCtrl,
          decoration: const InputDecoration(
            labelText: 'Day Title',
            prefixIcon: Icon(Icons.title, size: 18),
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => _emitDayUpdate(),
        ),
        SizedBox(height: 8.h),

        // City + Overnight city
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _cityCtrl,
                decoration: const InputDecoration(
                  labelText: 'City',
                  prefixIcon: Icon(Icons.location_on_outlined, size: 18),
                  border: OutlineInputBorder(),
                ),
                onChanged: (_) => _emitDayUpdate(),
              ),
            ),
            SizedBox(width: 8.w),
            Expanded(
              child: TextField(
                controller: _overnightCityCtrl,
                decoration: const InputDecoration(
                  labelText: 'Overnight City',
                  prefixIcon: Icon(Icons.hotel_outlined, size: 18),
                  border: OutlineInputBorder(),
                ),
                onChanged: (_) => _emitDayUpdate(),
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ── Images section ───────────────────────────────────────

  Widget _buildImagesSection(ItineraryFormDay day, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Images',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            Text(
              '${day.images.length}/10',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
        SizedBox(height: 8.h),
        SizedBox(
          height: 80.h,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              // Existing images
              ...day.images.map((imageKey) {
                return Padding(
                  padding: EdgeInsets.only(right: 8.w),
                  child: Stack(
                    children: [
                      Container(
                        width: 80.w,
                        height: 80.h,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusSm),
                          border: Border.all(
                            color: theme.dividerTheme.color ??
                                const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Center(
                          child: Icon(
                            Icons.image_outlined,
                            size: 28.sp,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.3),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: InkWell(
                          onTap: () => _notifier.removeImage(imageKey),
                          child: Container(
                            width: 20.w,
                            height: 20.h,
                            decoration: BoxDecoration(
                              color: AppTheme.errorColor,
                              borderRadius:
                                  BorderRadius.circular(AppTheme.radiusXs),
                            ),
                            child: Icon(
                              Icons.close,
                              size: 14.sp,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),

              // Add image button
              if (day.images.length < 10)
                InkWell(
                  onTap: () {
                    // Placeholder: In the future, this will open a file picker.
                    _notifier.addImage(
                        'img_${DateTime.now().millisecondsSinceEpoch}');
                  },
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                  child: Container(
                    width: 80.w,
                    height: 80.h,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                      border: Border.all(
                        color: AppTheme.primaryColor.withValues(alpha: 0.4),
                      ),
                      color: AppTheme.primaryColor.withValues(alpha: 0.05),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 24.sp,
                          color: AppTheme.primaryColor.withValues(alpha: 0.7),
                        ),
                        SizedBox(height: 2.h),
                        Text(
                          'Add',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color:
                                AppTheme.primaryColor.withValues(alpha: 0.7),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Items section ───────────────────────────────────────

  Widget _buildItemsSection(ItineraryFormDay day, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header row
        Row(
          children: [
            Text(
              'Items',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(width: 8.w),
            Container(
              padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.radiusXl),
              ),
              child: Text(
                '${day.items.length}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppTheme.primaryColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const Spacer(),
            // "Add Activity" dropdown button
            _AddActivityDropdown(
              onTypeSelected: (type) {
                _notifier.addItem(type);
              },
            ),
          ],
        ),
        SizedBox(height: 8.h),

        // Items list (reorderable)
        if (day.items.isEmpty)
          _buildEmptyItemsState(theme)
        else
          ReorderableListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: day.items.length,
            onReorder: (oldIndex, newIndex) {
              _notifier.reorderItems(oldIndex, newIndex);
            },
            proxyDecorator: (child, index, animation) {
              return AnimatedBuilder(
                animation: animation,
                builder: (context, child) {
                  return Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                    child: child,
                  );
                },
                child: child,
              );
            },
            itemBuilder: (context, index) {
              final item = day.items[index];
              return _ItemSummaryTile(
                key: ValueKey(item.id),
                item: item,
                typeIcon: _iconForType(item.type),
                typeColor: _colorForType(item.type),
                onTap: () => _showItemForm(item),
                onRemove: () => _notifier.removeItem(item.id),
              );
            },
          ),
      ],
    );
  }

  void _showItemForm(ItineraryFormItem item) {
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
          initialChildSize: 0.85,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              padding: EdgeInsets.all(16.w),
              child: ItemForm(
                item: item,
                onUpdated: (updatedItem) {
                  _notifier.updateItem(updatedItem);
                },
                onRemove: () {
                  _notifier.removeItem(item.id);
                  Navigator.of(context).pop();
                },
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildEmptyItemsState(ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(vertical: 32.h),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(
          color: theme.dividerTheme.color ?? const Color(0xFFE2E8F0),
        ),
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.inventory_2_outlined,
            size: 40.sp,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.25),
          ),
          SizedBox(height: 8.h),
          Text(
            'No items added yet',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            'Tap "Add Activity" to add hotels, transport, activities, and more',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ── Item summary tile for the reorderable list ───────────────

class _ItemSummaryTile extends StatelessWidget {
  final ItineraryFormItem item;
  final IconData typeIcon;
  final Color typeColor;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  const _ItemSummaryTile({
    super.key,
    required this.item,
    required this.typeIcon,
    required this.typeColor,
    required this.onTap,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.only(bottom: 8.h),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 10.h),
          child: Row(
            children: [
              // Drag handle
              ReorderableDragStartListener(
                index: item.sortOrder,
                child: Icon(
                  Icons.drag_indicator,
                  size: 18.sp,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.3),
                ),
              ),
              SizedBox(width: 8.w),

              // Type icon
              Container(
                width: 36.w,
                height: 36.h,
                decoration: BoxDecoration(
                  color: typeColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(typeIcon, size: 20.sp, color: typeColor),
              ),
              SizedBox(width: 12.w),

              // Title + type label
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title.isEmpty
                          ? 'Untitled ${item.type}'
                          : item.title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    SizedBox(height: 2.h),
                    Text(
                      item.type.toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: typeColor,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),

              // Prices
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (item.costPrice > 0)
                    Text(
                      'Cost: \u20B9${item.costPrice.toStringAsFixed(0)}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.6),
                      ),
                    ),
                  if (item.sellingPrice > 0)
                    Text(
                      'Sell: \u20B9${item.sellingPrice.toStringAsFixed(0)}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppTheme.successColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
              SizedBox(width: 4.w),

              // Remove button
              IconButton(
                icon: Icon(
                  Icons.delete_outline,
                  size: 18.sp,
                  color: AppTheme.errorColor.withValues(alpha: 0.7),
                ),
                onPressed: onRemove,
                style: IconButton.styleFrom(
                  minimumSize: Size(32.w, 32.h),
                  padding: EdgeInsets.zero,
                ),
                tooltip: 'Remove item',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── "Add Activity" dropdown button ───────────────────────────

class _AddActivityDropdown extends StatelessWidget {
  final ValueChanged<String> onTypeSelected;

  const _AddActivityDropdown({required this.onTypeSelected});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      onSelected: onTypeSelected,
      offset: Offset(0, 40.h),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      ),
      itemBuilder: (context) {
        return _itemTypes.map((t) {
          return PopupMenuItem<String>(
            value: t.type,
            child: Row(
              children: [
                Container(
                  width: 32.w,
                  height: 32.h,
                  decoration: BoxDecoration(
                    color: t.color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppTheme.radiusXs),
                  ),
                  child: Icon(t.icon, size: 18.sp, color: t.color),
                ),
                SizedBox(width: 12.w),
                Text(
                  t.label,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                ),
              ],
            ),
          );
        }).toList();
      },
      child: FilledButton.icon(
        icon: Icon(Icons.add, size: 18.sp),
        label: const Text('Add Activity'),
        onPressed: null, // handled by PopupMenuButton
        style: FilledButton.styleFrom(
          padding: EdgeInsets.symmetric(
            horizontal: 12.w,
            vertical: 8.h,
          ),
          textStyle: TextStyle(fontSize: 13.sp),
        ),
      ),
    );
  }
}
