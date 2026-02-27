import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/forms/app_address_field.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_provider.dart';
import '../widgets/trip_cost_estimate_card.dart';

class TripFormScreen extends ConsumerStatefulWidget {
  final String? tripId;
  const TripFormScreen({super.key, this.tripId});
  @override
  ConsumerState<TripFormScreen> createState() => _TripFormScreenState();
}

class _TripFormScreenState extends ConsumerState<TripFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  // Trip type
  String _tripType = 'one_way';

  // Vehicle / Driver
  String? _selectedVehicleId;
  String? _selectedDriverId;
  String? _selectedVehicleType;
  DateTime? _pickupDatetime;
  DateTime? _dropDatetime;

  // Locations
  final _pickupLocationController = TextEditingController();
  final _dropLocationController = TextEditingController();
  double? _pickupLat;
  double? _pickupLng;
  double? _dropLat;
  double? _dropLng;

  // Passenger
  final _passengerNameController = TextEditingController();
  final _passengerPhoneController = TextEditingController();
  final _instructionsController = TextEditingController();

  // Contact (for invoicing)
  String? _contactId;

  // Availability
  List<VehicleModel> _availableVehicles = [];
  List<DriverModel> _availableDrivers = [];
  bool _loadingAvailability = false;

  // Rate card & Cost
  VehicleRateCardModel? _rateCard;
  bool _loadingRateCard = false;
  Map<String, dynamic>? _costEstimate;
  bool _loadingEstimate = false;
  String? _estimateError;

  // Distance
  double? _distanceKm;
  double? _durationMin;
  final _manualDistanceController = TextEditingController();
  bool _useManualDistance = false;

  // Cost override
  bool _costOverrideEnabled = false;
  final _costOverrideController = TextEditingController();
  final _costOverrideReasonController = TextEditingController();

  // Voucher
  bool _autoCreateVoucher = true;

  bool get _isEdit => widget.tripId != null;

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
    if (_isEdit) {
      _loadTrip();
    } else {
      setState(() => _initializing = false);
    }
  }

  Future<void> _loadTrip() async {
    try {
      final data = await ref
          .read(fleetRepositoryProvider)
          .getTripDetail(widget.tripId!);
      if (!mounted) return;
      setState(() {
        _tripType = data['tripType'] ?? 'one_way';
        _selectedVehicleId = data['vehicleId'];
        _selectedDriverId = data['driverId'];
        _contactId = data['contactId'];
        _pickupDatetime = data['pickupDatetime'] != null
            ? DateTime.tryParse(data['pickupDatetime'])
            : null;
        _dropDatetime = data['dropDatetime'] != null
            ? DateTime.tryParse(data['dropDatetime'])
            : null;
        _pickupLocationController.text = data['pickupLocation'] ?? '';
        _dropLocationController.text = data['dropLocation'] ?? '';
        _pickupLat = (data['pickupLat'] as num?)?.toDouble();
        _pickupLng = (data['pickupLng'] as num?)?.toDouble();
        _dropLat = (data['dropLat'] as num?)?.toDouble();
        _dropLng = (data['dropLng'] as num?)?.toDouble();
        _passengerNameController.text = data['passengerName'] ?? '';
        _passengerPhoneController.text = data['passengerPhone'] ?? '';
        _instructionsController.text = data['specialInstructions'] ?? '';
        if (data['estimatedDistanceKm'] != null) {
          _distanceKm = (data['estimatedDistanceKm'] as num).toDouble();
        }
        if (data['estimatedDurationMin'] != null) {
          _durationMin = (data['estimatedDurationMin'] as num).toDouble();
        }
        if (data['estimatedBreakdown'] != null &&
            data['estimatedBreakdown'] is Map) {
          _costEstimate =
              Map<String, dynamic>.from(data['estimatedBreakdown'] as Map);
        }
        if (data['costOverride'] != null) {
          _costOverrideEnabled = true;
          _costOverrideController.text = data['costOverride'].toString();
          _costOverrideReasonController.text =
              data['costOverrideReason'] ?? '';
        }
        _initializing = false;
      });
      _loadAvailability();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Failed: $e'), backgroundColor: Colors.red));
      context.pop();
    }
  }

  Future<void> _loadAvailability() async {
    if (_pickupDatetime == null || _dropDatetime == null) return;
    setState(() => _loadingAvailability = true);
    try {
      final repo = ref.read(fleetRepositoryProvider);
      final from = _pickupDatetime!.toIso8601String();
      final to = _dropDatetime!.toIso8601String();
      final results = await Future.wait([
        repo.getVehicles(
            status: 'available',
            availableFrom: from,
            availableTo: to,
            limit: 100),
        repo.getDrivers(
            status: 'active',
            availableFrom: from,
            availableTo: to,
            limit: 100),
      ]);
      if (!mounted) return;
      setState(() {
        _availableVehicles =
            (results[0] as PaginatedResponse<VehicleModel>).data;
        _availableDrivers =
            (results[1] as PaginatedResponse<DriverModel>).data;
        _loadingAvailability = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loadingAvailability = false);
    }
  }

  void _onVehicleSelected(String? vehicleId) {
    setState(() => _selectedVehicleId = vehicleId);
    if (vehicleId != null) {
      final vehicle =
          _availableVehicles.where((v) => v.id == vehicleId).firstOrNull;
      if (vehicle != null) {
        _selectedVehicleType = vehicle.type;
        _lookupRateCard();
      }
    }
  }

  Future<void> _lookupRateCard() async {
    if (_selectedVehicleType == null) return;
    setState(() {
      _loadingRateCard = true;
      _rateCard = null;
    });
    try {
      final card = await ref.read(fleetRepositoryProvider).lookupRateCard(
            vehicleType: _selectedVehicleType!,
            tripType: _tripType,
          );
      if (!mounted) return;
      setState(() {
        _rateCard = card;
        _loadingRateCard = false;
      });
      _calculateEstimate();
    } catch (_) {
      if (mounted) setState(() => _loadingRateCard = false);
    }
  }

  Future<void> _calculateDistance() async {
    if (_pickupLat == null ||
        _pickupLng == null ||
        _dropLat == null ||
        _dropLng == null) {
      return;
    }
    try {
      final result =
          await ref.read(fleetRepositoryProvider).calculateDistance(
                originLat: _pickupLat!,
                originLng: _pickupLng!,
                destLat: _dropLat!,
                destLng: _dropLng!,
              );
      if (!mounted) return;
      setState(() {
        _distanceKm = (result['distanceKm'] as num?)?.toDouble();
        _durationMin = (result['durationMinutes'] as num?)?.toDouble();
      });
      _calculateEstimate();
    } catch (_) {
      // Silent — user can enter distance manually
    }
  }

  Future<void> _calculateEstimate() async {
    if (_rateCard == null) return;
    final dist = _useManualDistance
        ? double.tryParse(_manualDistanceController.text)
        : _distanceKm;
    if (dist == null || dist <= 0) return;

    setState(() {
      _loadingEstimate = true;
      _estimateError = null;
    });

    try {
      int? numDays;
      int? numNights;
      if (_pickupDatetime != null && _dropDatetime != null) {
        final diff = _dropDatetime!.difference(_pickupDatetime!);
        numDays = diff.inDays > 0 ? diff.inDays : 1;
        numNights =
            _pickupDatetime!.hour >= 22 || _pickupDatetime!.hour < 6 ? 1 : 0;
      }

      final result =
          await ref.read(fleetRepositoryProvider).estimateTripCost(
                rateCardId: _rateCard!.id,
                distanceKm: dist,
                durationMinutes: _durationMin ?? (dist * 2),
                numDays: numDays,
                numNights: numNights,
              );
      if (!mounted) return;
      setState(() {
        _costEstimate = result;
        _loadingEstimate = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _estimateError = e.toString();
          _loadingEstimate = false;
        });
      }
    }
  }

  void _onPickupAddressSelected(AddressResult result) {
    _pickupLat = result.lat;
    _pickupLng = result.lng;
    if (_pickupLat != null && _dropLat != null) _calculateDistance();
  }

  void _onDropAddressSelected(AddressResult result) {
    _dropLat = result.lat;
    _dropLng = result.lng;
    if (_pickupLat != null && _dropLat != null) _calculateDistance();
  }

  Future<void> _pickDateTime({required bool isPickup}) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: DateTime(2030),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.now());
    if (time == null || !mounted) return;
    final dt =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() {
      if (isPickup) {
        _pickupDatetime = dt;
      } else {
        _dropDatetime = dt;
      }
    });
    if (_pickupDatetime != null && _dropDatetime != null) {
      _loadAvailability();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedVehicleId == null || _selectedDriverId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Select vehicle and driver'),
          backgroundColor: Colors.red));
      return;
    }
    setState(() => _loading = true);
    try {
      final data = <String, dynamic>{
        'vehicleId': _selectedVehicleId,
        'driverId': _selectedDriverId,
        'tripType': _tripType,
        'pickupDatetime': _pickupDatetime!.toIso8601String(),
        'dropDatetime': _dropDatetime!.toIso8601String(),
        if (_pickupLocationController.text.isNotEmpty)
          'pickupLocation': _pickupLocationController.text.trim(),
        if (_dropLocationController.text.isNotEmpty)
          'dropLocation': _dropLocationController.text.trim(),
        if (_pickupLat != null) 'pickupLat': _pickupLat,
        if (_pickupLng != null) 'pickupLng': _pickupLng,
        if (_dropLat != null) 'dropLat': _dropLat,
        if (_dropLng != null) 'dropLng': _dropLng,
        if (_rateCard != null) 'rateCardId': _rateCard!.id,
        if (_distanceKm != null) 'estimatedDistanceKm': _distanceKm,
        if (_durationMin != null) 'estimatedDurationMin': _durationMin,
        if (_costEstimate != null)
          'estimatedCost':
              (_costEstimate!['total'] as num?)?.toDouble() ?? 0,
        if (_costEstimate != null) 'estimatedBreakdown': _costEstimate,
        if (_contactId != null) 'contactId': _contactId,
        if (_passengerNameController.text.isNotEmpty)
          'passengerName': _passengerNameController.text.trim(),
        if (_passengerPhoneController.text.isNotEmpty)
          'passengerPhone': _passengerPhoneController.text.trim(),
        if (_instructionsController.text.isNotEmpty)
          'specialInstructions': _instructionsController.text.trim(),
        if (_costOverrideEnabled &&
            _costOverrideController.text.isNotEmpty) ...<String, dynamic>{
          'costOverride':
              double.tryParse(_costOverrideController.text) ?? 0,
          'costOverrideReason':
              _costOverrideReasonController.text.trim(),
        },
        'autoCreateVoucher': _autoCreateVoucher,
      };

      final repo = ref.read(fleetRepositoryProvider);
      _isEdit
          ? await repo.updateTrip(widget.tripId!, data)
          : await repo.createTrip(data);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_isEdit ? 'Trip updated' : 'Trip created'),
          backgroundColor: Colors.green));
      ref.read(tripListProvider.notifier).load(refresh: true);
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Failed: $e'), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _pickupLocationController.dispose();
    _dropLocationController.dispose();
    _passengerNameController.dispose();
    _passengerPhoneController.dispose();
    _instructionsController.dispose();
    _manualDistanceController.dispose();
    _costOverrideController.dispose();
    _costOverrideReasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const Center(child: CircularProgressIndicator());
    }

    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Trip Type ────────────────────────────
            Text('Trip Type', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _tripTypes.entries.map((e) {
                final selected = _tripType == e.key;
                return ChoiceChip(
                  label: Text(e.value),
                  selected: selected,
                  onSelected: (_) {
                    setState(() => _tripType = e.key);
                    if (_selectedVehicleType != null) _lookupRateCard();
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            // ── Schedule ─────────────────────────────
            Text('Schedule', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDateTime(isPickup: true),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(
                    _pickupDatetime != null
                        ? _pickupDatetime!
                            .toString()
                            .substring(0, 16)
                        : 'Pickup Date/Time *',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDateTime(isPickup: false),
                  icon: const Icon(Icons.calendar_today, size: 16),
                  label: Text(
                    _dropDatetime != null
                        ? _dropDatetime!
                            .toString()
                            .substring(0, 16)
                        : 'Drop Date/Time *',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 20),

            // ── Locations (Google Places) ─────────────
            Text('Locations', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            AppAddressField(
              controller: _pickupLocationController,
              label: 'Pickup Location',
              hint: 'Search pickup address...',
              onAddressSelected: _onPickupAddressSelected,
            ),
            const SizedBox(height: 12),
            AppAddressField(
              controller: _dropLocationController,
              label: 'Drop Location',
              hint: 'Search drop-off address...',
              onAddressSelected: _onDropAddressSelected,
            ),
            if (_distanceKm != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.straighten, size: 16, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  '${_distanceKm!.toStringAsFixed(1)} km',
                  style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey[700],
                      fontWeight: FontWeight.w500),
                ),
                if (_durationMin != null) ...[
                  const SizedBox(width: 16),
                  Icon(Icons.access_time,
                      size: 16, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    '${(_durationMin! / 60).toStringAsFixed(1)} hrs',
                    style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[700],
                        fontWeight: FontWeight.w500),
                  ),
                ],
              ]),
            ],
            const SizedBox(height: 8),
            // Manual distance override
            SwitchListTile(
              title: const Text('Enter distance manually',
                  style: TextStyle(fontSize: 13)),
              value: _useManualDistance,
              onChanged: (v) {
                setState(() => _useManualDistance = v);
                if (!v && _distanceKm != null) _calculateEstimate();
              },
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
            if (_useManualDistance)
              TextFormField(
                controller: _manualDistanceController,
                decoration: const InputDecoration(
                  labelText: 'Distance (km)',
                  suffixText: 'km',
                ),
                keyboardType: TextInputType.number,
                onChanged: (_) => _calculateEstimate(),
              ),
            const SizedBox(height: 20),

            // ── Vehicle & Driver ─────────────────────
            Text('Vehicle & Driver', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            if (_loadingAvailability) const LinearProgressIndicator(),
            if (_pickupDatetime == null || _dropDatetime == null)
              Text('Select pickup and drop times to see available vehicles',
                  style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey[600],
                      fontStyle: FontStyle.italic)),
            if (!_loadingAvailability && _availableVehicles.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _selectedVehicleId,
                decoration: const InputDecoration(
                    labelText: 'Vehicle *',
                    prefixIcon: Icon(Icons.directions_car)),
                items: _availableVehicles
                    .map((v) => DropdownMenuItem(
                        value: v.id,
                        child: Text(
                            '${v.registrationNumber} - ${v.type}${v.seatingCapacity != null ? ' (${v.seatingCapacity} seats)' : ''}')))
                    .toList(),
                onChanged: _onVehicleSelected,
                validator: (v) => v == null ? 'Select a vehicle' : null,
              ),
            const SizedBox(height: 12),
            if (!_loadingAvailability && _availableDrivers.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _selectedDriverId,
                decoration: const InputDecoration(
                    labelText: 'Driver *',
                    prefixIcon: Icon(Icons.person)),
                items: _availableDrivers
                    .map((d) => DropdownMenuItem(
                        value: d.id,
                        child: Text('${d.name} - ${d.phone}')))
                    .toList(),
                onChanged: (v) => setState(() => _selectedDriverId = v),
                validator: (v) => v == null ? 'Select a driver' : null,
              ),

            // Rate Card Info
            if (_loadingRateCard) ...[
              const SizedBox(height: 12),
              Row(children: [
                const SizedBox(
                    width: 16,
                    height: 16,
                    child:
                        CircularProgressIndicator(strokeWidth: 2)),
                const SizedBox(width: 8),
                Text('Looking up rate card...',
                    style: TextStyle(
                        fontSize: 13, color: Colors.grey[600])),
              ]),
            ],
            if (_rateCard != null) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color:
                      theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(children: [
                  Icon(Icons.price_change,
                      size: 16, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Rate Card: ${_rateCard!.name}',
                      style: TextStyle(
                          fontSize: 13,
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w500),
                    ),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 20),

            // ── Cost Estimation ──────────────────────
            TripCostEstimateCard(
              breakdown: _costEstimate,
              loading: _loadingEstimate,
              error: _estimateError,
            ),
            const SizedBox(height: 12),

            // Cost override
            SwitchListTile(
              title: const Text('Override cost',
                  style: TextStyle(fontSize: 13)),
              value: _costOverrideEnabled,
              onChanged: (v) =>
                  setState(() => _costOverrideEnabled = v),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
            if (_costOverrideEnabled) ...[
              Row(children: [
                Expanded(
                  child: TextFormField(
                    controller: _costOverrideController,
                    decoration: const InputDecoration(
                      labelText: 'Override Amount',
                      prefixText: '\u20B9 ',
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _costOverrideReasonController,
                    decoration: const InputDecoration(
                      labelText: 'Reason',
                    ),
                  ),
                ),
              ]),
            ],
            const SizedBox(height: 20),

            // ── Passenger Info ───────────────────────
            Text('Passenger Info', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            TextFormField(
              controller: _passengerNameController,
              decoration: const InputDecoration(
                  labelText: 'Passenger Name',
                  prefixIcon: Icon(Icons.person_outline)),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _passengerPhoneController,
              decoration: const InputDecoration(
                  labelText: 'Passenger Phone',
                  prefixIcon: Icon(Icons.phone)),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _instructionsController,
              decoration: const InputDecoration(
                  labelText: 'Special Instructions',
                  prefixIcon: Icon(Icons.notes)),
              maxLines: 3,
            ),
            const SizedBox(height: 20),

            // ── Options ──────────────────────────────
            if (!_isEdit)
              CheckboxListTile(
                title: const Text('Auto-create transport voucher'),
                value: _autoCreateVoucher,
                onChanged: (v) =>
                    setState(() => _autoCreateVoucher = v ?? true),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              ),
            const SizedBox(height: 16),

            // ── Submit ───────────────────────────────
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(_isEdit ? 'Update Trip' : 'Create Trip'),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
