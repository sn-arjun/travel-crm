import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme.dart';
import '../../data/itinerary_state.dart';

/// Pax type options shared across the item form.
const _paxTypes = ['Per Person', 'Per Room', 'Per Group', 'Per Vehicle'];

/// Room type options for Hotel items.
const _roomTypes = ['Standard', 'Deluxe', 'Suite', 'Villa'];

/// Meal plan options for Hotel items.
const _mealPlans = ['EP', 'CP', 'MAP', 'AP'];

/// Meal type options for Meal items.
const _mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/// Flight class options.
const _flightClasses = ['Economy', 'Premium Economy', 'Business', 'First'];

/// A unified item form widget that adapts its fields based on the
/// item type (TICKET-089).
///
/// Common fields (title, pricing, timing, etc.) are always shown,
/// while type-specific fields (hotel room type, flight PNR, etc.)
/// appear in a collapsible card below.
class ItemForm extends StatefulWidget {
  final ItineraryFormItem item;
  final ValueChanged<ItineraryFormItem> onUpdated;
  final VoidCallback onRemove;

  const ItemForm({
    super.key,
    required this.item,
    required this.onUpdated,
    required this.onRemove,
  });

  @override
  State<ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends State<ItemForm> {
  late TextEditingController _titleCtrl;
  late TextEditingController _descCtrl;
  late TextEditingController _costCtrl;
  late TextEditingController _sellingCtrl;
  late TextEditingController _taxRateCtrl;
  late TextEditingController _qtyCtrl;
  late TextEditingController _notesCtrl;
  late TextEditingController _timeStartCtrl;
  late TextEditingController _timeEndCtrl;

  bool _expanded = true;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.item.title);
    _descCtrl = TextEditingController(text: widget.item.description ?? '');
    _costCtrl = TextEditingController(
        text: widget.item.costPrice > 0
            ? widget.item.costPrice.toStringAsFixed(2)
            : '');
    _sellingCtrl = TextEditingController(
        text: widget.item.sellingPrice > 0
            ? widget.item.sellingPrice.toStringAsFixed(2)
            : '');
    _taxRateCtrl = TextEditingController(
        text: widget.item.taxRate > 0
            ? widget.item.taxRate.toStringAsFixed(1)
            : '');
    _qtyCtrl =
        TextEditingController(text: widget.item.quantity.toString());
    _notesCtrl =
        TextEditingController(text: widget.item.internalNotes ?? '');
    _timeStartCtrl =
        TextEditingController(text: widget.item.timeStart ?? '');
    _timeEndCtrl =
        TextEditingController(text: widget.item.timeEnd ?? '');
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _costCtrl.dispose();
    _sellingCtrl.dispose();
    _taxRateCtrl.dispose();
    _qtyCtrl.dispose();
    _notesCtrl.dispose();
    _timeStartCtrl.dispose();
    _timeEndCtrl.dispose();
    super.dispose();
  }

  /// Builds a new [ItineraryFormItem] from current field values and
  /// passes it upstream.
  void _emitUpdate({Map<String, dynamic>? detailsOverride}) {
    widget.onUpdated(widget.item.copyWith(
      title: _titleCtrl.text,
      description: _descCtrl.text.isEmpty ? null : _descCtrl.text,
      costPrice: double.tryParse(_costCtrl.text) ?? 0,
      sellingPrice: double.tryParse(_sellingCtrl.text) ?? 0,
      taxRate: double.tryParse(_taxRateCtrl.text) ?? 0,
      quantity: int.tryParse(_qtyCtrl.text) ?? 1,
      internalNotes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
      timeStart: _timeStartCtrl.text.isEmpty ? null : _timeStartCtrl.text,
      timeEnd: _timeEndCtrl.text.isEmpty ? null : _timeEndCtrl.text,
      detailsJson: detailsOverride ?? widget.item.detailsJson,
    ));
  }

  void _updatePaxType(String? value) {
    widget.onUpdated(widget.item.copyWith(paxType: value));
  }

  /// Helper to update a single key inside [detailsJson].
  void _updateDetail(String key, dynamic value) {
    final details =
        Map<String, dynamic>.from(widget.item.detailsJson ?? {});
    details[key] = value;
    _emitUpdate(detailsOverride: details);
  }

  IconData _iconForType(String type) {
    switch (type.toLowerCase()) {
      case 'hotel':
        return Icons.hotel;
      case 'transport':
        return Icons.directions_car;
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
    final theme = Theme.of(context);
    final typeColor = _colorForType(widget.item.type);

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Header (always visible) ──────────────────────
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.vertical(
              top: const Radius.circular(AppTheme.radiusLg),
              bottom: _expanded
                  ? Radius.zero
                  : const Radius.circular(AppTheme.radiusLg),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.spacingSm,
                vertical: AppTheme.spacingSm,
              ),
              child: Row(
                children: [
                  // Drag handle
                  Icon(
                    Icons.drag_indicator,
                    size: 18,
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.3),
                  ),
                  const SizedBox(width: AppTheme.spacingXs),

                  // Type icon
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: typeColor.withValues(alpha: 0.1),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Icon(
                      _iconForType(widget.item.type),
                      size: 18,
                      color: typeColor,
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingSm),

                  // Title + type label
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.item.title.isEmpty
                              ? 'Untitled ${widget.item.type}'
                              : widget.item.title,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          widget.item.type.toUpperCase(),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: typeColor,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Price summary
                  if (widget.item.sellingPrice > 0)
                    Text(
                      '\u20B9${widget.item.sellingPrice.toStringAsFixed(0)} x${widget.item.quantity}',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),

                  // Expand/collapse icon
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    size: 20,
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ],
              ),
            ),
          ),

          // ── Expanded form ────────────────────────────────
          if (_expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Common fields
                  _buildCommonFields(theme),

                  const SizedBox(height: AppTheme.spacingMd),

                  // Type-specific fields
                  _buildTypeSpecificFields(theme),

                  const SizedBox(height: AppTheme.spacingMd),

                  // Internal notes
                  TextField(
                    controller: _notesCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Internal Notes',
                      hintText: 'Notes visible only to staff...',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 2,
                    onChanged: (_) => _emitUpdate(),
                  ),

                  const SizedBox(height: AppTheme.spacingSm),

                  // Remove button
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      icon: const Icon(Icons.delete_outline, size: 16),
                      label: const Text('Remove Item'),
                      onPressed: widget.onRemove,
                      style: TextButton.styleFrom(
                        foregroundColor: AppTheme.errorColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── Common fields ─────────────────────────────────────────

  Widget _buildCommonFields(ThemeData theme) {
    return Column(
      children: [
        // Title
        TextField(
          controller: _titleCtrl,
          decoration: const InputDecoration(
            labelText: 'Title *',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => _emitUpdate(),
        ),
        const SizedBox(height: AppTheme.spacingSm),

        // Description
        TextField(
          controller: _descCtrl,
          decoration: const InputDecoration(
            labelText: 'Description',
            border: OutlineInputBorder(),
          ),
          maxLines: 2,
          onChanged: (_) => _emitUpdate(),
        ),
        const SizedBox(height: AppTheme.spacingSm),

        // Cost price + Selling price
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _costCtrl,
                decoration: const InputDecoration(
                  labelText: 'Cost Price',
                  prefixText: '\u20B9 ',
                  border: OutlineInputBorder(),
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                      RegExp(r'^\d*\.?\d{0,2}')),
                ],
                onChanged: (_) => _emitUpdate(),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(
              child: TextField(
                controller: _sellingCtrl,
                decoration: const InputDecoration(
                  labelText: 'Selling Price',
                  prefixText: '\u20B9 ',
                  border: OutlineInputBorder(),
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                      RegExp(r'^\d*\.?\d{0,2}')),
                ],
                onChanged: (_) => _emitUpdate(),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSm),

        // Quantity + Tax Rate + Pax Type
        Row(
          children: [
            // Quantity
            SizedBox(
              width: 80,
              child: TextField(
                controller: _qtyCtrl,
                decoration: const InputDecoration(
                  labelText: 'Qty',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => _emitUpdate(),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),

            // Tax rate
            SizedBox(
              width: 90,
              child: TextField(
                controller: _taxRateCtrl,
                decoration: const InputDecoration(
                  labelText: 'Tax %',
                  border: OutlineInputBorder(),
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                      RegExp(r'^\d*\.?\d{0,1}')),
                ],
                onChanged: (_) => _emitUpdate(),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),

            // Pax type
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: widget.item.paxType,
                decoration: const InputDecoration(
                  labelText: 'Pax Type',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: _paxTypes
                    .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                    .toList(),
                onChanged: _updatePaxType,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingSm),

        // Time start + Time end
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _timeStartCtrl,
                decoration: InputDecoration(
                  labelText: 'Start Time',
                  hintText: 'HH:MM',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.access_time, size: 18),
                    onPressed: () => _pickTime(isStart: true),
                  ),
                ),
                readOnly: true,
                onTap: () => _pickTime(isStart: true),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(
              child: TextField(
                controller: _timeEndCtrl,
                decoration: InputDecoration(
                  labelText: 'End Time',
                  hintText: 'HH:MM',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.access_time, size: 18),
                    onPressed: () => _pickTime(isStart: false),
                  ),
                ),
                readOnly: true,
                onTap: () => _pickTime(isStart: false),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _pickTime({required bool isStart}) async {
    final initial = TimeOfDay.now();
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
    );
    if (picked != null) {
      final formatted =
          '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      if (isStart) {
        _timeStartCtrl.text = formatted;
      } else {
        _timeEndCtrl.text = formatted;
      }
      _emitUpdate();
    }
  }

  // ── Type-specific fields ──────────────────────────────────

  Widget _buildTypeSpecificFields(ThemeData theme) {
    switch (widget.item.type.toLowerCase()) {
      case 'hotel':
        return _buildHotelFields(theme);
      case 'transport':
        return _buildTransportFields(theme);
      case 'activity':
        return _buildActivityFields(theme);
      case 'meal':
        return _buildMealFields(theme);
      case 'flight':
        return _buildFlightFields(theme);
      default:
        return const SizedBox.shrink();
    }
  }

  // ── Hotel ─────────────────────────────────────────────────

  Widget _buildHotelFields(ThemeData theme) {
    final details = widget.item.detailsJson ?? {};

    return _TypeSpecificCard(
      title: 'Hotel Details',
      icon: Icons.hotel,
      color: _colorForType('hotel'),
      child: Column(
        children: [
          Row(
            children: [
              // Room type
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: details['roomType'] as String?,
                  decoration: const InputDecoration(
                    labelText: 'Room Type',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: _roomTypes
                      .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                      .toList(),
                  onChanged: (v) => _updateDetail('roomType', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              // Meal plan
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: details['mealPlan'] as String?,
                  decoration: const InputDecoration(
                    labelText: 'Meal Plan',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: _mealPlans
                      .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                      .toList(),
                  onChanged: (v) => _updateDetail('mealPlan', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Check-in',
                  hint: 'YYYY-MM-DD',
                  value: details['checkIn'] as String?,
                  onChanged: (v) => _updateDetail('checkIn', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Check-out',
                  hint: 'YYYY-MM-DD',
                  value: details['checkOut'] as String?,
                  onChanged: (v) => _updateDetail('checkOut', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _DetailTextField(
            label: 'Special Requests',
            value: details['specialRequests'] as String?,
            onChanged: (v) => _updateDetail('specialRequests', v),
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  // ── Transport ─────────────────────────────────────────────

  Widget _buildTransportFields(ThemeData theme) {
    final details = widget.item.detailsJson ?? {};

    return _TypeSpecificCard(
      title: 'Transport Details',
      icon: Icons.directions_car,
      color: _colorForType('transport'),
      child: Column(
        children: [
          _DetailTextField(
            label: 'Vehicle Type',
            hint: 'e.g. Sedan, SUV, Bus',
            value: details['vehicleType'] as String?,
            onChanged: (v) => _updateDetail('vehicleType', v),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Pickup Location',
                  value: details['pickupLocation'] as String?,
                  onChanged: (v) => _updateDetail('pickupLocation', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Drop Location',
                  value: details['dropLocation'] as String?,
                  onChanged: (v) => _updateDetail('dropLocation', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _DetailTextField(
            label: 'Pickup Time',
            hint: 'HH:MM',
            value: details['pickupTime'] as String?,
            onChanged: (v) => _updateDetail('pickupTime', v),
          ),
        ],
      ),
    );
  }

  // ── Activity ──────────────────────────────────────────────

  Widget _buildActivityFields(ThemeData theme) {
    final details = widget.item.detailsJson ?? {};

    return _TypeSpecificCard(
      title: 'Activity Details',
      icon: Icons.hiking,
      color: _colorForType('activity'),
      child: Column(
        children: [
          _DetailTextField(
            label: 'Duration',
            hint: 'e.g. 2 hours, Half day',
            value: details['duration'] as String?,
            onChanged: (v) => _updateDetail('duration', v),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _DetailTextField(
            label: 'Meeting Point',
            value: details['meetingPoint'] as String?,
            onChanged: (v) => _updateDetail('meetingPoint', v),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _DetailTextField(
            label: 'What to Bring',
            value: details['whatToBring'] as String?,
            onChanged: (v) => _updateDetail('whatToBring', v),
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  // ── Meal ──────────────────────────────────────────────────

  Widget _buildMealFields(ThemeData theme) {
    final details = widget.item.detailsJson ?? {};

    return _TypeSpecificCard(
      title: 'Meal Details',
      icon: Icons.restaurant,
      color: _colorForType('meal'),
      child: Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: details['mealType'] as String?,
            decoration: const InputDecoration(
              labelText: 'Meal Type',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: _mealTypes
                .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                .toList(),
            onChanged: (v) => _updateDetail('mealType', v),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Restaurant',
                  value: details['restaurant'] as String?,
                  onChanged: (v) => _updateDetail('restaurant', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Cuisine',
                  value: details['cuisine'] as String?,
                  onChanged: (v) => _updateDetail('cuisine', v),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Flight ────────────────────────────────────────────────

  Widget _buildFlightFields(ThemeData theme) {
    final details = widget.item.detailsJson ?? {};

    return _TypeSpecificCard(
      title: 'Flight Details',
      icon: Icons.flight,
      color: _colorForType('flight'),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Airline',
                  value: details['airline'] as String?,
                  onChanged: (v) => _updateDetail('airline', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Flight Number',
                  value: details['flightNumber'] as String?,
                  onChanged: (v) => _updateDetail('flightNumber', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Departure Airport',
                  value: details['departureAirport'] as String?,
                  onChanged: (v) => _updateDetail('departureAirport', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Departure Time',
                  hint: 'HH:MM',
                  value: details['departureTime'] as String?,
                  onChanged: (v) => _updateDetail('departureTime', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: _DetailTextField(
                  label: 'Arrival Airport',
                  value: details['arrivalAirport'] as String?,
                  onChanged: (v) => _updateDetail('arrivalAirport', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'Arrival Time',
                  hint: 'HH:MM',
                  value: details['arrivalTime'] as String?,
                  onChanged: (v) => _updateDetail('arrivalTime', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: details['flightClass'] as String?,
                  decoration: const InputDecoration(
                    labelText: 'Class',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: _flightClasses
                      .map((c) =>
                          DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => _updateDetail('flightClass', v),
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Expanded(
                child: _DetailTextField(
                  label: 'PNR',
                  value: details['pnr'] as String?,
                  onChanged: (v) => _updateDetail('pnr', v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _DetailTextField(
            label: 'Baggage Allowance',
            hint: 'e.g. 15kg check-in + 7kg cabin',
            value: details['baggage'] as String?,
            onChanged: (v) => _updateDetail('baggage', v),
          ),
        ],
      ),
    );
  }
}

// ── Reusable helpers ──────────────────────────────────────────

/// A card wrapper for type-specific field groups.
class _TypeSpecificCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Widget child;

  const _TypeSpecificCard({
    required this.title,
    required this.icon,
    required this.color,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(
          color: color.withValues(alpha: 0.3),
        ),
        color: color.withValues(alpha: 0.03),
      ),
      padding: const EdgeInsets.all(AppTheme.spacingSm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: AppTheme.spacingXs),
              Text(
                title,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          child,
        ],
      ),
    );
  }
}

/// A simple text field that manages its own controller for
/// [detailsJson] entries.
class _DetailTextField extends StatefulWidget {
  final String label;
  final String? hint;
  final String? value;
  final ValueChanged<String> onChanged;
  final int maxLines;

  const _DetailTextField({
    required this.label,
    this.hint,
    this.value,
    required this.onChanged,
    this.maxLines = 1,
  });

  @override
  State<_DetailTextField> createState() => _DetailTextFieldState();
}

class _DetailTextFieldState extends State<_DetailTextField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value ?? '');
  }

  @override
  void didUpdateWidget(covariant _DetailTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value &&
        _controller.text != (widget.value ?? '')) {
      _controller.text = widget.value ?? '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      maxLines: widget.maxLines,
      onChanged: widget.onChanged,
    );
  }
}
