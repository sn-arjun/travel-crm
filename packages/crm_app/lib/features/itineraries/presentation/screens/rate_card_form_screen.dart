import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/itinerary_provider.dart';

/// Create / Edit rate card form screen.
///
/// If [rateCardId] is provided, fetches the existing rate card data and
/// pre-fills all fields for editing. Otherwise presents a blank form for
/// creating a new rate card.
class RateCardFormScreen extends ConsumerStatefulWidget {
  final String? rateCardId;

  const RateCardFormScreen({super.key, this.rateCardId});

  @override
  ConsumerState<RateCardFormScreen> createState() =>
      _RateCardFormScreenState();
}

class _RateCardFormScreenState extends ConsumerState<RateCardFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  // ── Form field values ──────────────────────────────────────

  String _name = '';
  String _serviceType = 'hotel';
  String? _destination;
  String? _description;
  String? _season;
  double _costPrice = 0;
  double? _sellingPrice;
  String _currency = 'INR';
  String? _unit;
  DateTime? _validFrom;
  DateTime? _validTo;
  double? _childPricePercent;
  bool _isActive = true;

  bool get _isEdit => widget.rateCardId != null;

  static const _serviceTypes = [
    'hotel',
    'transport',
    'sightseeing',
    'meal',
    'flight',
    'activity',
    'other',
  ];

  static const _seasons = ['peak', 'off_peak', 'shoulder'];

  static const _currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

  static const _units = [
    'per_night',
    'per_person',
    'per_trip',
    'per_km',
    'per_day',
    'per_pax',
    'per_room',
    'per_vehicle',
  ];

  // ── Lifecycle ───────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _loadRateCard();
    } else {
      setState(() => _initializing = false);
    }
  }

  Future<void> _loadRateCard() async {
    try {
      final repo = ref.read(rateCardRepositoryProvider);
      final card = await repo.getRateCard(widget.rateCardId!);
      if (!mounted) return;
      setState(() {
        _name = card.name;
        _serviceType = card.serviceType;
        _destination = card.destination;
        _description = card.description;
        _season = card.season;
        _costPrice = card.costPrice;
        _sellingPrice = card.sellingPrice;
        _currency = card.currency;
        _unit = card.unit;
        _validFrom = card.validFrom != null
            ? DateTime.tryParse(card.validFrom!)
            : null;
        _validTo =
            card.validTo != null ? DateTime.tryParse(card.validTo!) : null;
        _childPricePercent = card.childPricePercent;
        _isActive = card.isActive;
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _initializing = false);
      AppSnackbar.error(context, 'Failed to load rate card');
    }
  }

  // ── Build ───────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_initializing) {
      return const Scaffold(body: Center(child: AppLoading()));
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Edit Rate Card' : 'New Rate Card'),
        actions: [
          TextButton(
            onPressed: _loading ? null : () => context.pop(),
            child: const Text('Cancel'),
          ),
          SizedBox(width: 8.w),
          FilledButton(
            onPressed: _loading ? null : _save,
            child: _loading
                ? SizedBox(
                    width: 20.w,
                    height: 20.h,
                    child: const CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Save'),
          ),
          SizedBox(width: 16.w),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16.w),
          children: [
            // ── Basic Information ──────────────────────────
            _buildSectionHeader('Basic Information', theme),
            SizedBox(height: 12.h),
            TextFormField(
              initialValue: _name,
              decoration: const InputDecoration(
                labelText: 'Name *',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Name is required' : null,
              onSaved: (v) => _name = v?.trim() ?? '',
            ),
            SizedBox(height: 12.h),

            // Service Type
            DropdownButtonFormField<String>(
              initialValue: _serviceType,
              decoration: const InputDecoration(
                labelText: 'Service Type *',
                border: OutlineInputBorder(),
              ),
              items: _serviceTypes
                  .map((t) => DropdownMenuItem(
                        value: t,
                        child: Row(
                          children: [
                            Icon(_iconForServiceType(t), size: 18),
                            SizedBox(width: 8.w),
                            Text(_formatServiceType(t)),
                          ],
                        ),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _serviceType = v);
              },
            ),
            SizedBox(height: 12.h),

            // Destination
            TextFormField(
              initialValue: _destination,
              decoration: const InputDecoration(
                labelText: 'Destination',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.place_outlined, size: 18),
              ),
              onSaved: (v) =>
                  _destination = v != null && v.trim().isNotEmpty
                      ? v.trim()
                      : null,
            ),
            SizedBox(height: 12.h),

            // Description
            TextFormField(
              initialValue: _description,
              decoration: const InputDecoration(
                labelText: 'Description',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
              maxLines: 3,
              onSaved: (v) =>
                  _description = v != null && v.trim().isNotEmpty
                      ? v.trim()
                      : null,
            ),
            SizedBox(height: 24.h),

            // ── Season ────────────────────────────────────
            _buildSectionHeader('Season', theme),
            SizedBox(height: 8.h),
            Wrap(
              spacing: 8.w,
              children: _seasons.map((s) {
                final isSelected = _season == s;
                return ChoiceChip(
                  label: Text(_formatSeason(s)),
                  selected: isSelected,
                  onSelected: (selected) {
                    setState(() => _season = selected ? s : null);
                  },
                );
              }).toList(),
            ),
            SizedBox(height: 24.h),

            // ── Pricing ────────────────────────────────────
            _buildSectionHeader('Pricing', theme),
            SizedBox(height: 12.h),

            // Cost Price + Selling Price
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue:
                        _costPrice > 0 ? _costPrice.toString() : '',
                    decoration: const InputDecoration(
                      labelText: 'Cost Price *',
                      prefixText: '\u20B9 ',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,2}')),
                    ],
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return 'Required';
                      }
                      if (double.tryParse(v.trim()) == null) {
                        return 'Invalid number';
                      }
                      return null;
                    },
                    onSaved: (v) =>
                        _costPrice = double.tryParse(v?.trim() ?? '') ?? 0,
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: TextFormField(
                    initialValue: _sellingPrice?.toString() ?? '',
                    decoration: const InputDecoration(
                      labelText: 'Selling Price',
                      prefixText: '\u20B9 ',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                        decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,2}')),
                    ],
                    onSaved: (v) =>
                        _sellingPrice = double.tryParse(v?.trim() ?? ''),
                  ),
                ),
              ],
            ),
            SizedBox(height: 12.h),

            // Currency + Unit
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _currency,
                    decoration: const InputDecoration(
                      labelText: 'Currency',
                      border: OutlineInputBorder(),
                    ),
                    items: _currencies
                        .map((c) =>
                            DropdownMenuItem(value: c, child: Text(c)))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _currency = v);
                    },
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _unit,
                    decoration: const InputDecoration(
                      labelText: 'Unit',
                      border: OutlineInputBorder(),
                    ),
                    items: _units
                        .map((u) => DropdownMenuItem(
                              value: u,
                              child: Text(_formatUnit(u)),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _unit = v),
                  ),
                ),
              ],
            ),
            SizedBox(height: 12.h),

            // Child Price Percent
            TextFormField(
              initialValue: _childPricePercent?.toString() ?? '',
              decoration: const InputDecoration(
                labelText: 'Child Price (%)',
                hintText: 'e.g. 50 for 50% of adult price',
                border: OutlineInputBorder(),
                suffixText: '%',
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(
                    RegExp(r'^\d*\.?\d{0,1}')),
              ],
              onSaved: (v) =>
                  _childPricePercent = double.tryParse(v?.trim() ?? ''),
            ),
            SizedBox(height: 24.h),

            // ── Validity Period ─────────────────────────────
            _buildSectionHeader('Validity Period', theme),
            SizedBox(height: 12.h),
            Row(
              children: [
                Expanded(
                  child: _DatePickerField(
                    label: 'Valid From',
                    selectedDate: _validFrom,
                    onDateSelected: (d) =>
                        setState(() => _validFrom = d),
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: _DatePickerField(
                    label: 'Valid To',
                    selectedDate: _validTo,
                    firstDate: _validFrom,
                    onDateSelected: (d) =>
                        setState(() => _validTo = d),
                  ),
                ),
              ],
            ),
            SizedBox(height: 24.h),

            // ── Active Toggle ───────────────────────────────
            Card(
              child: SwitchListTile(
                title: const Text('Active'),
                subtitle: Text(
                  _isActive
                      ? 'This rate card is active and can be used in itineraries'
                      : 'This rate card is inactive and will not appear in lookups',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
                value: _isActive,
                onChanged: (v) => setState(() => _isActive = v),
                secondary: Icon(
                  _isActive
                      ? Icons.check_circle_outline
                      : Icons.cancel_outlined,
                  color: _isActive
                      ? AppTheme.successColor
                      : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
            SizedBox(height: 48.h),
          ],
        ),
      ),
    );
  }

  // ── Section header ──────────────────────────────────────────

  Widget _buildSectionHeader(String title, ThemeData theme) {
    return Text(
      title,
      style: theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w700,
        color: AppTheme.primaryColor,
      ),
    );
  }

  // ── Save ────────────────────────────────────────────────────

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    _formKey.currentState!.save();

    setState(() => _loading = true);

    final data = <String, dynamic>{
      'name': _name,
      'serviceType': _serviceType,
      'costPrice': _costPrice,
      'currency': _currency,
      'isActive': _isActive,
      if (_destination != null) 'destination': _destination,
      if (_description != null) 'description': _description,
      if (_season != null) 'season': _season,
      if (_sellingPrice != null) 'sellingPrice': _sellingPrice,
      if (_unit != null) 'unit': _unit,
      if (_validFrom != null)
        'validFrom': _validFrom!.toIso8601String().split('T').first,
      if (_validTo != null)
        'validTo': _validTo!.toIso8601String().split('T').first,
      if (_childPricePercent != null)
        'childPricePercent': _childPricePercent,
    };

    try {
      final repo = ref.read(rateCardRepositoryProvider);
      if (_isEdit) {
        await repo.updateRateCard(widget.rateCardId!, data);
      } else {
        await repo.createRateCard(data);
      }
      if (!mounted) return;
      AppSnackbar.success(
        context,
        _isEdit ? 'Rate card updated' : 'Rate card created',
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      final message =
          e is ApiException ? e.message : 'Failed to save rate card';
      AppSnackbar.error(context, message);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  static IconData _iconForServiceType(String type) {
    return switch (type) {
      'hotel' => Icons.hotel,
      'transport' => Icons.directions_car,
      'sightseeing' => Icons.photo_camera,
      'activity' => Icons.hiking,
      'meal' => Icons.restaurant,
      'flight' => Icons.flight,
      'other' => Icons.category,
      _ => Icons.category_outlined,
    };
  }

  static String _formatServiceType(String type) {
    return switch (type) {
      'hotel' => 'Hotel',
      'transport' => 'Transport',
      'sightseeing' => 'Sightseeing',
      'activity' => 'Activity',
      'meal' => 'Meal',
      'flight' => 'Flight',
      'other' => 'Other',
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

  static String _formatUnit(String unit) {
    return switch (unit) {
      'per_night' => 'Per Night',
      'per_person' => 'Per Person',
      'per_trip' => 'Per Trip',
      'per_km' => 'Per KM',
      'per_day' => 'Per Day',
      'per_pax' => 'Per Pax',
      'per_room' => 'Per Room',
      'per_vehicle' => 'Per Vehicle',
      _ => unit,
    };
  }
}

// ── Date picker field ─────────────────────────────────────────

class _DatePickerField extends StatelessWidget {
  final String label;
  final DateTime? selectedDate;
  final DateTime? firstDate;
  final ValueChanged<DateTime?> onDateSelected;

  const _DatePickerField({
    required this.label,
    this.selectedDate,
    this.firstDate,
    required this.onDateSelected,
  });

  @override
  Widget build(BuildContext context) {
    final displayText = selectedDate != null
        ? '${selectedDate!.year}-${selectedDate!.month.toString().padLeft(2, '0')}-${selectedDate!.day.toString().padLeft(2, '0')}'
        : '';

    return TextFormField(
      readOnly: true,
      controller: TextEditingController(text: displayText),
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        suffixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selectedDate != null)
              IconButton(
                icon: Icon(Icons.clear, size: 18.sp),
                onPressed: () => onDateSelected(null),
                tooltip: 'Clear date',
              ),
            IconButton(
              icon: Icon(Icons.calendar_today_outlined, size: 18.sp),
              onPressed: () => _pickDate(context),
              tooltip: 'Select date',
            ),
          ],
        ),
      ),
      onTap: () => _pickDate(context),
    );
  }

  Future<void> _pickDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate ?? now,
      firstDate: firstDate ?? DateTime(now.year - 2),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) {
      onDateSelected(picked);
    }
  }
}
