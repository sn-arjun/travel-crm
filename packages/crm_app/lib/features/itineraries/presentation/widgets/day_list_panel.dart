import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../data/itinerary_state.dart';

/// Vertical list of day cards with drag-and-drop reordering (TICKET-087).
///
/// Each day card shows the day number, an editable title, city,
/// overnight city, and a free-day toggle. The selected day is
/// highlighted with the primary colour. An "Add Day" button sits
/// at the bottom and each card has a trash-icon for removal.
class DayListPanel extends StatelessWidget {
  final List<ItineraryFormDay> days;
  final int selectedIndex;
  final ValueChanged<int> onDaySelected;
  final VoidCallback onAddDay;
  final ValueChanged<int> onRemoveDay;
  final void Function(int oldIndex, int newIndex) onReorder;
  final ValueChanged<ItineraryFormDay> onDayUpdated;

  const DayListPanel({
    super.key,
    required this.days,
    required this.selectedIndex,
    required this.onDaySelected,
    required this.onAddDay,
    required this.onRemoveDay,
    required this.onReorder,
    required this.onDayUpdated,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.spacingMd,
            vertical: AppTheme.spacingSm,
          ),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(
              bottom: BorderSide(
                color: theme.dividerTheme.color ?? const Color(0xFFE2E8F0),
              ),
            ),
          ),
          child: Row(
            children: [
              Icon(
                Icons.calendar_view_day_outlined,
                size: 18,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Text(
                'Days (${days.length})',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),

        // Day cards (reorderable)
        Expanded(
          child: ReorderableListView.builder(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.spacingSm,
              vertical: AppTheme.spacingSm,
            ),
            itemCount: days.length,
            onReorder: onReorder,
            proxyDecorator: (child, index, animation) {
              return AnimatedBuilder(
                animation: animation,
                builder: (context, child) {
                  return Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    child: child,
                  );
                },
                child: child,
              );
            },
            itemBuilder: (context, index) {
              final day = days[index];
              final isSelected = index == selectedIndex;

              return _DayCard(
                key: ValueKey(day.id),
                day: day,
                isSelected: isSelected,
                canRemove: days.length > 1,
                onTap: () => onDaySelected(index),
                onRemove: () => onRemoveDay(index),
                onTitleChanged: (title) {
                  onDayUpdated(day.copyWith(title: title));
                },
                onFreeDayToggled: (isFree) {
                  onDayUpdated(day.copyWith(isFreeDay: isFree));
                },
              );
            },
          ),
        ),

        // Add Day button
        Padding(
          padding: const EdgeInsets.all(AppTheme.spacingSm),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add Day'),
              onPressed: onAddDay,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Day Card ──────────────────────────────────────────────────

class _DayCard extends StatefulWidget {
  final ItineraryFormDay day;
  final bool isSelected;
  final bool canRemove;
  final VoidCallback onTap;
  final VoidCallback onRemove;
  final ValueChanged<String> onTitleChanged;
  final ValueChanged<bool> onFreeDayToggled;

  const _DayCard({
    super.key,
    required this.day,
    required this.isSelected,
    required this.canRemove,
    required this.onTap,
    required this.onRemove,
    required this.onTitleChanged,
    required this.onFreeDayToggled,
  });

  @override
  State<_DayCard> createState() => _DayCardState();
}

class _DayCardState extends State<_DayCard> {
  late final TextEditingController _titleController;
  bool _isEditingTitle = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(
      text: widget.day.title ?? 'Day ${widget.day.dayNumber}',
    );
  }

  @override
  void didUpdateWidget(covariant _DayCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.day.title != widget.day.title && !_isEditingTitle) {
      _titleController.text =
          widget.day.title ?? 'Day ${widget.day.dayNumber}';
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final borderColor = widget.isSelected
        ? AppTheme.primaryColor
        : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0));

    final bgColor = widget.isSelected
        ? AppTheme.primaryColor.withValues(alpha: isDark ? 0.15 : 0.05)
        : theme.colorScheme.surface;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingXs),
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Container(
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(color: borderColor, width: widget.isSelected ? 1.5 : 1),
          ),
          padding: const EdgeInsets.all(AppTheme.spacingSm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Row 1: Day number + title + drag handle
              Row(
                children: [
                  // Day number badge
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: widget.isSelected
                          ? AppTheme.primaryColor
                          : theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppTheme.radiusXs),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${widget.day.dayNumber}',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: widget.isSelected
                            ? Colors.white
                            : theme.colorScheme.onSurface,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingSm),

                  // Editable title
                  Expanded(
                    child: _isEditingTitle
                        ? TextField(
                            controller: _titleController,
                            autofocus: true,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 6,
                              ),
                              border: OutlineInputBorder(),
                            ),
                            onSubmitted: (value) {
                              widget.onTitleChanged(value);
                              setState(() => _isEditingTitle = false);
                            },
                            onEditingComplete: () {
                              widget.onTitleChanged(_titleController.text);
                              setState(() => _isEditingTitle = false);
                            },
                          )
                        : GestureDetector(
                            onDoubleTap: () {
                              setState(() => _isEditingTitle = true);
                            },
                            child: Text(
                              widget.day.title ?? 'Day ${widget.day.dayNumber}',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                  ),

                  // Drag handle
                  ReorderableDragStartListener(
                    index: widget.day.dayNumber - 1,
                    child: Icon(
                      Icons.drag_indicator,
                      size: 18,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),

              // Row 2: City + overnight city
              if (widget.day.city != null || widget.day.overnightCity != null)
                Padding(
                  padding: const EdgeInsets.only(
                    top: AppTheme.spacingXs,
                    left: 36,
                  ),
                  child: Row(
                    children: [
                      if (widget.day.city != null) ...[
                        Icon(
                          Icons.location_on_outlined,
                          size: 12,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        ),
                        const SizedBox(width: 2),
                        Flexible(
                          child: Text(
                            widget.day.city!,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.6),
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                      if (widget.day.city != null &&
                          widget.day.overnightCity != null)
                        const SizedBox(width: AppTheme.spacingSm),
                      if (widget.day.overnightCity != null) ...[
                        Icon(
                          Icons.hotel_outlined,
                          size: 12,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        ),
                        const SizedBox(width: 2),
                        Flexible(
                          child: Text(
                            widget.day.overnightCity!,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.6),
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

              // Row 3: Free day toggle + remove button
              Padding(
                padding: const EdgeInsets.only(top: AppTheme.spacingXs),
                child: Row(
                  children: [
                    // Free day toggle
                    SizedBox(
                      height: 24,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Transform.scale(
                            scale: 0.7,
                            child: Switch(
                              value: widget.day.isFreeDay,
                              onChanged: widget.onFreeDayToggled,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                          Text(
                            'Free day',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: widget.day.isFreeDay
                                  ? AppTheme.primaryColor
                                  : theme.colorScheme.onSurface
                                      .withValues(alpha: 0.5),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    // Item count badge
                    if (widget.day.items.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryColor.withValues(alpha: 0.1),
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusXl),
                        ),
                        child: Text(
                          '${widget.day.items.length} items',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.primaryColor,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),

                    // Remove button
                    if (widget.canRemove)
                      IconButton(
                        icon: Icon(
                          Icons.delete_outline,
                          size: 16,
                          color: AppTheme.errorColor.withValues(alpha: 0.7),
                        ),
                        onPressed: widget.onRemove,
                        style: IconButton.styleFrom(
                          minimumSize: const Size(28, 28),
                          padding: EdgeInsets.zero,
                        ),
                        tooltip: 'Remove day',
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
