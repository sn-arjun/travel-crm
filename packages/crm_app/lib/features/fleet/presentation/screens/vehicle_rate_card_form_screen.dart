import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_provider.dart';
import '../../data/fleet_repository.dart';

class VehicleRateCardFormScreen extends ConsumerStatefulWidget {
  final String? rateCardId;

  const VehicleRateCardFormScreen({super.key, this.rateCardId});

  @override
  ConsumerState<VehicleRateCardFormScreen> createState() =>
      _VehicleRateCardFormScreenState();
}

class _VehicleRateCardFormScreenState
    extends ConsumerState<VehicleRateCardFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _loadingData = false;

  // Core
  final _nameController = TextEditingController();
  String _vehicleType = 'sedan';
  String _tripType = 'one_way';
  bool _isActive = true;

  // Pricing
  bool _isFlat = false;
  final _flatRateController = TextEditingController();
  final _baseFareController = TextEditingController(text: '0');
  final _perKmRateController = TextEditingController(text: '0');
  final _perHourRateController = TextEditingController(text: '0');
  final _minKmController = TextEditingController(text: '0');
  final _minHoursController = TextEditingController(text: '0');
  final _extraKmRateController = TextEditingController(text: '0');
  final _extraHourRateController = TextEditingController(text: '0');

  // Surcharges
  final _nightChargeController = TextEditingController(text: '0');
  final _driverAllowanceController = TextEditingController(text: '0');
  bool _tollIncluded = false;
  bool _parkingIncluded = false;

  // Validity
  final _notesController = TextEditingController();

  bool get isEditing => widget.rateCardId != null;

  static const _vehicleTypes = {
    'sedan': 'Sedan',
    'suv': 'SUV',
    'muv': 'MUV',
    'tempo_traveller': 'Tempo Traveller',
    'mini_bus': 'Mini Bus',
    'bus': 'Bus',
    'luxury_coach': 'Luxury Coach',
  };

  static const _tripTypes = {
    'one_way': 'One Way',
    'round_trip': 'Round Trip',
    'airport_pickup': 'Airport Pickup',
    'airport_drop': 'Airport Drop',
    'local_8h80km': 'Local 8hr/80km',
    'local_12h120km': 'Local 12hr/120km',
    'outstation': 'Outstation',
  };

  @override
  void initState() {
    super.initState();
    if (isEditing) _loadExisting();
  }

  Future<void> _loadExisting() async {
    setState(() => _loadingData = true);
    try {
      final card = await ref
          .read(fleetRepositoryProvider)
          .getVehicleRateCard(widget.rateCardId!);
      _nameController.text = card.name;
      _vehicleType = card.vehicleType;
      _tripType = card.tripType;
      _isActive = card.isActive;
      _baseFareController.text = card.baseFare.toString();
      _perKmRateController.text = card.perKmRate.toString();
      _perHourRateController.text = card.perHourRate.toString();
      _minKmController.text = card.minKm.toString();
      _minHoursController.text = card.minHours.toString();
      _extraKmRateController.text = card.extraKmRate.toString();
      _extraHourRateController.text = card.extraHourRate.toString();
      _nightChargeController.text = card.nightCharge.toString();
      _driverAllowanceController.text = card.driverAllowance.toString();
      _tollIncluded = card.tollIncluded;
      _parkingIncluded = card.parkingIncluded;
      _notesController.text = card.notes ?? '';
      if (card.flatRate != null && card.flatRate! > 0) {
        _isFlat = true;
        _flatRateController.text = card.flatRate.toString();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading rate card: $e')),
        );
      }
    }
    if (mounted) setState(() => _loadingData = false);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _flatRateController.dispose();
    _baseFareController.dispose();
    _perKmRateController.dispose();
    _perHourRateController.dispose();
    _minKmController.dispose();
    _minHoursController.dispose();
    _extraKmRateController.dispose();
    _extraHourRateController.dispose();
    _nightChargeController.dispose();
    _driverAllowanceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    final data = <String, dynamic>{
      'name': _nameController.text.trim(),
      'vehicleType': _vehicleType,
      'tripType': _tripType,
      'isActive': _isActive,
      'baseFare': double.tryParse(_baseFareController.text) ?? 0,
      'perKmRate': double.tryParse(_perKmRateController.text) ?? 0,
      'perHourRate': double.tryParse(_perHourRateController.text) ?? 0,
      'minKm': double.tryParse(_minKmController.text) ?? 0,
      'minHours': double.tryParse(_minHoursController.text) ?? 0,
      'extraKmRate': double.tryParse(_extraKmRateController.text) ?? 0,
      'extraHourRate': double.tryParse(_extraHourRateController.text) ?? 0,
      'nightCharge': double.tryParse(_nightChargeController.text) ?? 0,
      'driverAllowance': double.tryParse(_driverAllowanceController.text) ?? 0,
      'flatRate': _isFlat ? (double.tryParse(_flatRateController.text) ?? 0) : null,
      'tollIncluded': _tollIncluded,
      'parkingIncluded': _parkingIncluded,
      'notes': _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
    };

    try {
      final repo = ref.read(fleetRepositoryProvider);
      if (isEditing) {
        await repo.updateVehicleRateCard(widget.rateCardId!, data);
      } else {
        await repo.createVehicleRateCard(data);
      }
      ref.read(rateCardListProvider.notifier).load(refresh: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Rate card ${isEditing ? 'updated' : 'created'} successfully'),
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingData) {
      return Scaffold(
        appBar: AppBar(title: const Text('Rate Card')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? 'Edit Rate Card' : 'New Rate Card'),
        actions: [
          TextButton(
            onPressed: _loading ? null : _save,
            child: _loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Name
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Rate Card Name *',
                hintText: 'e.g., Sedan One-Way Delhi',
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 16),

            // Vehicle Type & Trip Type
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _vehicleType,
                    decoration: const InputDecoration(labelText: 'Vehicle Type'),
                    items: _vehicleTypes.entries
                        .map((e) => DropdownMenuItem(
                            value: e.key, child: Text(e.value)))
                        .toList(),
                    onChanged: (v) => setState(() => _vehicleType = v!),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _tripType,
                    decoration: const InputDecoration(labelText: 'Trip Type'),
                    items: _tripTypes.entries
                        .map((e) => DropdownMenuItem(
                            value: e.key, child: Text(e.value)))
                        .toList(),
                    onChanged: (v) => setState(() => _tripType = v!),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Flat Rate Toggle
            SwitchListTile(
              title: const Text('Flat Rate'),
              subtitle: const Text('Fixed price regardless of distance/time'),
              value: _isFlat,
              onChanged: (v) => setState(() => _isFlat = v),
              contentPadding: EdgeInsets.zero,
            ),

            if (_isFlat) ...[
              TextFormField(
                controller: _flatRateController,
                decoration: const InputDecoration(
                  labelText: 'Flat Rate Amount',
                  prefixText: '\u20B9 ',
                ),
                keyboardType: TextInputType.number,
              ),
            ] else ...[
              const Divider(height: 32),
              const Text('Pricing',
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _baseFareController,
                      decoration: const InputDecoration(
                        labelText: 'Base Fare',
                        prefixText: '\u20B9 ',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _perKmRateController,
                      decoration: const InputDecoration(
                        labelText: 'Per KM Rate',
                        prefixText: '\u20B9 ',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _perHourRateController,
                      decoration: const InputDecoration(
                        labelText: 'Per Hour Rate',
                        prefixText: '\u20B9 ',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _minKmController,
                      decoration: const InputDecoration(
                        labelText: 'Minimum KM',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _minHoursController,
                      decoration: const InputDecoration(
                        labelText: 'Minimum Hours',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(child: SizedBox()),
                ],
              ),

              // Extra charges for local packages
              if (_tripType.startsWith('local_')) ...[
                const SizedBox(height: 16),
                const Text('Extra Charges (beyond package)',
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _extraKmRateController,
                        decoration: const InputDecoration(
                          labelText: 'Extra KM Rate',
                          prefixText: '\u20B9 ',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _extraHourRateController,
                        decoration: const InputDecoration(
                          labelText: 'Extra Hour Rate',
                          prefixText: '\u20B9 ',
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
              ],
            ],

            const Divider(height: 32),
            const Text('Surcharges',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _nightChargeController,
                    decoration: const InputDecoration(
                      labelText: 'Night Charge',
                      prefixText: '\u20B9 ',
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _driverAllowanceController,
                    decoration: const InputDecoration(
                      labelText: 'Driver Allowance / Day',
                      prefixText: '\u20B9 ',
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            CheckboxListTile(
              title: const Text('Toll Included'),
              value: _tollIncluded,
              onChanged: (v) => setState(() => _tollIncluded = v!),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),
            CheckboxListTile(
              title: const Text('Parking Included'),
              value: _parkingIncluded,
              onChanged: (v) => setState(() => _parkingIncluded = v!),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),

            const Divider(height: 32),

            // Active toggle
            SwitchListTile(
              title: const Text('Active'),
              subtitle: const Text('Inactive rate cards won\'t be used for estimates'),
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v),
              contentPadding: EdgeInsets.zero,
            ),

            // Notes
            TextFormField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'Optional notes about this rate card',
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
