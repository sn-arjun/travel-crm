import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../app/theme.dart';
import '../../../../core/data/airport_data.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../../leads/presentation/widgets/lead_selector.dart';
import '../../data/voucher_provider.dart';

class VoucherFormScreen extends ConsumerStatefulWidget {
  final String? voucherId;
  final String? initialType;

  const VoucherFormScreen({
    super.key,
    this.voucherId,
    this.initialType,
  });

  @override
  ConsumerState<VoucherFormScreen> createState() => _VoucherFormScreenState();
}

class _VoucherFormScreenState extends ConsumerState<VoucherFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  late String _type;
  String? _leadId;
  String? _leadTitle;
  String? _supplierId;

  final _titleCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  // Dynamic details controllers based on type
  final Map<String, TextEditingController> _detailsCtrls = {};

  // Airport selections (for flight type)
  Airport? _departureAirport;
  Airport? _arrivalAirport;

  // Dropdown selections
  String _mealPlan = 'EP';
  String _roomType = 'Deluxe';
  String _travelClass = 'economy';
  String _vehicleType = 'Sedan';

  @override
  void initState() {
    super.initState();
    _type = widget.initialType ?? 'hotel';
    if (widget.voucherId != null) {
      _loadVoucher(widget.voucherId!);
    } else {
      _initDetailsCtrls(_type, null);
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _notesCtrl.dispose();
    for (final ctrl in _detailsCtrls.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  Future<void> _loadVoucher(String id) async {
    setState(() => _isLoading = true);
    try {
      final voucher = await ref.read(voucherRepositoryProvider).getVoucher(id);
      _type = voucher.type;
      _leadId = voucher.leadId;
      _leadTitle = voucher.leadName;
      _supplierId = voucher.supplierId;
      _titleCtrl.text = voucher.title;
      _notesCtrl.text = voucher.notes ?? '';

      _initDetailsCtrls(_type, voucher.details);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to load voucher');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _initDetailsCtrls(String type, Map<String, dynamic>? data) {
    _detailsCtrls.clear();
    final d = data ?? {};

    if (type == 'hotel') {
      _detailsCtrls['hotelName'] = TextEditingController(text: d['hotelName'] ?? '');
      _detailsCtrls['hotelAddress'] = TextEditingController(text: d['hotelAddress'] ?? '');
      _detailsCtrls['checkIn'] = TextEditingController(text: d['checkIn'] ?? '');
      _detailsCtrls['checkOut'] = TextEditingController(text: d['checkOut'] ?? '');
      _roomType = d['roomType'] ?? 'Deluxe';
      _detailsCtrls['roomCount'] = TextEditingController(text: (d['roomCount'] ?? 1).toString());
      _mealPlan = d['mealPlan'] ?? 'EP';
      _detailsCtrls['confirmationNumber'] = TextEditingController(text: d['confirmationNumber'] ?? '');
      _detailsCtrls['guestNames'] = TextEditingController(text: (d['guestNames'] as List?)?.join(', ') ?? '');
    } else if (type == 'transport') {
      _vehicleType = d['vehicleType'] ?? 'Sedan';
      _detailsCtrls['driverName'] = TextEditingController(text: d['driverName'] ?? '');
      _detailsCtrls['driverPhone'] = TextEditingController(text: d['driverPhone'] ?? '');
      _detailsCtrls['pickupLocation'] = TextEditingController(text: d['pickupLocation'] ?? '');
      _detailsCtrls['pickupTime'] = TextEditingController(text: d['pickupTime'] ?? '');
      _detailsCtrls['dropLocation'] = TextEditingController(text: d['dropLocation'] ?? '');
    } else if (type == 'flight') {
      _detailsCtrls['airline'] = TextEditingController(text: d['airline'] ?? '');
      _detailsCtrls['flightNumber'] = TextEditingController(text: d['flightNumber'] ?? '');
      // Airports
      final depCode = d['departureAirport'] ?? '';
      final arrCode = d['arrivalAirport'] ?? '';
      _departureAirport = _findAirport(depCode);
      _arrivalAirport = _findAirport(arrCode);
      _detailsCtrls['departureTime'] = TextEditingController(text: d['departureTime'] ?? '');
      _detailsCtrls['arrivalTime'] = TextEditingController(text: d['arrivalTime'] ?? '');
      _detailsCtrls['pnr'] = TextEditingController(text: d['pnr'] ?? '');
      _travelClass = d['travelClass'] ?? 'economy';
    } else if (type == 'activity') {
      _detailsCtrls['activityName'] = TextEditingController(text: d['activityName'] ?? '');
      _detailsCtrls['dateTime'] = TextEditingController(text: d['dateTime'] ?? '');
      _detailsCtrls['meetingPoint'] = TextEditingController(text: d['meetingPoint'] ?? '');
      _detailsCtrls['duration'] = TextEditingController(text: d['duration'] ?? '');
      _detailsCtrls['operatorContact'] = TextEditingController(text: d['operatorContact'] ?? '');
    }
    if (mounted) setState(() {});
  }

  Airport? _findAirport(String codeOrName) {
    if (codeOrName.isEmpty) return null;
    final upper = codeOrName.toUpperCase();
    return majorAirports.cast<Airport?>().firstWhere(
      (a) => a!.code == upper || a.displayName.toUpperCase().contains(upper),
      orElse: () => null,
    );
  }

  Map<String, dynamic> _buildDetailsJson() {
    final Map<String, dynamic> d = {};

    if (_type == 'hotel') {
      d['hotelName'] = _detailsCtrls['hotelName']?.text ?? '';
      d['hotelAddress'] = _detailsCtrls['hotelAddress']?.text ?? '';
      d['checkIn'] = _detailsCtrls['checkIn']?.text ?? '';
      d['checkOut'] = _detailsCtrls['checkOut']?.text ?? '';
      d['roomType'] = _roomType;
      d['roomCount'] = int.tryParse(_detailsCtrls['roomCount']?.text ?? '1') ?? 1;
      d['mealPlan'] = _mealPlan;
      d['confirmationNumber'] = _detailsCtrls['confirmationNumber']?.text ?? '';
      d['guestNames'] = (_detailsCtrls['guestNames']?.text ?? '')
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      if (d['guestNames'].isEmpty) d['guestNames'] = ['Guest'];
    } else if (_type == 'transport') {
      d['vehicleType'] = _vehicleType;
      d['driverName'] = _detailsCtrls['driverName']?.text ?? '';
      d['driverPhone'] = _detailsCtrls['driverPhone']?.text ?? '';
      d['pickupLocation'] = _detailsCtrls['pickupLocation']?.text ?? '';
      d['pickupTime'] = _detailsCtrls['pickupTime']?.text ?? '';
      d['dropLocation'] = _detailsCtrls['dropLocation']?.text ?? '';
    } else if (_type == 'flight') {
      d['airline'] = _detailsCtrls['airline']?.text ?? '';
      d['flightNumber'] = _detailsCtrls['flightNumber']?.text ?? '';
      d['departureAirport'] = _departureAirport?.code ?? '';
      d['departureTime'] = _detailsCtrls['departureTime']?.text ?? '';
      d['arrivalAirport'] = _arrivalAirport?.code ?? '';
      d['arrivalTime'] = _detailsCtrls['arrivalTime']?.text ?? '';
      d['pnr'] = _detailsCtrls['pnr']?.text ?? '';
      d['travelClass'] = _travelClass;
      d['passengers'] = [{'name': 'Guest'}];
    } else if (_type == 'activity') {
      d['activityName'] = _detailsCtrls['activityName']?.text ?? '';
      d['dateTime'] = _detailsCtrls['dateTime']?.text ?? '';
      d['meetingPoint'] = _detailsCtrls['meetingPoint']?.text ?? '';
      d['duration'] = _detailsCtrls['duration']?.text ?? '';
      d['operatorContact'] = _detailsCtrls['operatorContact']?.text ?? '';
    }
    return d;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_leadId == null) {
      AppSnackbar.error(context, 'Please select a lead');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final repo = ref.read(voucherRepositoryProvider);

      final data = {
        'leadId': _leadId,
        'type': _type,
        'title': _titleCtrl.text,
        'supplierId': _supplierId,
        'notes': _notesCtrl.text,
        'details': _buildDetailsJson(),
        'language': 'en',
      };

      if (widget.voucherId != null) {
        data.remove('leadId');
        data.remove('type');
        await repo.updateVoucher(widget.voucherId!, data);
        if (mounted) AppSnackbar.success(context, 'Voucher updated successfully');
      } else {
        await repo.createVoucher(data);
        if (mounted) AppSnackbar.success(context, 'Voucher created successfully');
      }

      ref.read(voucherListProvider.notifier).load(refresh: true);
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to save voucher');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Date/Time Picker Helpers ──────────────────────────────

  Future<void> _pickDate(TextEditingController ctrl) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _tryParseDate(ctrl.text) ?? now,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );
    if (picked != null && mounted) {
      ctrl.text = DateFormat('yyyy-MM-dd').format(picked);
      setState(() {});
    }
  }

  Future<void> _pickDateTime(TextEditingController ctrl) async {
    final now = DateTime.now();
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _tryParseDate(ctrl.text) ?? now,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: _tryParseTime(ctrl.text) ?? TimeOfDay.now(),
    );
    if (pickedTime == null || !mounted) return;

    final dt = DateTime(
      pickedDate.year, pickedDate.month, pickedDate.day,
      pickedTime.hour, pickedTime.minute,
    );
    ctrl.text = DateFormat('yyyy-MM-dd HH:mm').format(dt);
    setState(() {});
  }

  DateTime? _tryParseDate(String text) {
    try {
      return DateFormat('yyyy-MM-dd').parseStrict(text.split(' ').first);
    } catch (_) {
      return null;
    }
  }

  TimeOfDay? _tryParseTime(String text) {
    try {
      final parts = text.split(' ');
      if (parts.length < 2) return null;
      final timeParts = parts[1].split(':');
      return TimeOfDay(hour: int.parse(timeParts[0]), minute: int.parse(timeParts[1]));
    } catch (_) {
      return null;
    }
  }

  // ── Airport Picker ──────────────────────────────────────────

  Future<void> _pickAirport({required bool isDeparture}) async {
    final searchCtrl = TextEditingController();
    var filtered = List<Airport>.from(majorAirports);

    final result = await showDialog<Airport>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(isDeparture ? 'Select Departure Airport' : 'Select Arrival Airport'),
          contentPadding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          content: SizedBox(
            width: 380,
            height: 420,
            child: Column(
              children: [
                TextField(
                  controller: searchCtrl,
                  autofocus: true,
                  decoration: const InputDecoration(
                    hintText: 'Search by code, city or name...',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (query) {
                    setDialogState(() {
                      final q = query.toLowerCase();
                      filtered = majorAirports.where((a) =>
                        a.code.toLowerCase().contains(q) ||
                        a.city.toLowerCase().contains(q) ||
                        a.name.toLowerCase().contains(q) ||
                        a.country.toLowerCase().contains(q)
                      ).toList();
                    });
                  },
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: filtered.isEmpty
                    ? const Center(child: Text('No airports found'))
                    : ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (_, i) {
                          final a = filtered[i];
                          final isSelected = isDeparture
                            ? a == _departureAirport
                            : a == _arrivalAirport;
                          return ListTile(
                            dense: true,
                            leading: Text(a.code, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            title: Text(a.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text('${a.city}, ${a.country}'),
                            selected: isSelected,
                            trailing: isSelected ? const Icon(Icons.check, size: 18) : null,
                            onTap: () => Navigator.of(ctx).pop(a),
                          );
                        },
                      ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          ],
        ),
      ),
    );

    if (result != null && mounted) {
      setState(() {
        if (isDeparture) {
          _departureAirport = result;
        } else {
          _arrivalAirport = result;
        }
      });
    }
  }

  // ── Build ──────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_isLoading && widget.voucherId != null && _titleCtrl.text.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.voucherId != null ? 'Edit $_type Voucher' : 'New $_type Voucher'),
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppSectionCard(
                title: 'Basic Info',
                child: Column(
                  children: [
                    TextFormField(
                      controller: _titleCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Voucher Title *',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    LeadSelector(
                      leadId: _leadId,
                      leadTitle: _leadTitle,
                      onChanged: widget.voucherId != null ? (l) {} : (l) {
                        setState(() {
                          _leadId = l?.id;
                          _leadTitle = l?.title;
                        });
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingLg),

              AppSectionCard(
                title: '${_type[0].toUpperCase()}${_type.substring(1)} Details',
                child: _buildDetailsFields(),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              AppSectionCard(
                title: 'Additional Notes',
                child: TextFormField(
                  controller: _notesCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Notes for internal or printing purposes',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => context.pop(),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingMd),
                  Expanded(
                    child: FilledButton(
                      onPressed: _isLoading ? null : _submit,
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save Voucher'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Detail Fields by Type ─────────────────────────────────

  Widget _buildDetailsFields() {
    switch (_type) {
      case 'hotel':
        return _buildHotelFields();
      case 'transport':
        return _buildTransportFields();
      case 'flight':
        return _buildFlightFields();
      case 'activity':
        return _buildActivityFields();
      default:
        return _buildGenericFields();
    }
  }

  Widget _buildHotelFields() {
    return Column(
      children: [
        _textField('hotelName', 'Hotel Name *',
            validator: _requiredValidator, icon: Icons.hotel_outlined),
        _textField('hotelAddress', 'Hotel Address', icon: Icons.location_on_outlined),
        const SizedBox(height: AppTheme.spacingMd),
        Row(
          children: [
            Expanded(child: _datePickerField('checkIn', 'Check-in Date *', validator: _requiredValidator)),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(child: _datePickerField('checkOut', 'Check-out Date *', validator: _requiredValidator)),
          ],
        ),
        const SizedBox(height: AppTheme.spacingMd),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _roomType,
                decoration: const InputDecoration(
                  labelText: 'Room Type',
                  border: OutlineInputBorder(),
                ),
                items: ['Standard', 'Deluxe', 'Suite', 'Premium', 'Villa', 'Cottage', 'Tent']
                    .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                    .toList(),
                onChanged: (v) => setState(() => _roomType = v ?? 'Deluxe'),
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            SizedBox(
              width: 100,
              child: _textField('roomCount', 'Rooms', keyboardType: TextInputType.number),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingMd),
        DropdownButtonFormField<String>(
          initialValue: _mealPlan,
          decoration: const InputDecoration(
            labelText: 'Meal Plan',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'EP', child: Text('EP - European Plan (No Meals)')),
            DropdownMenuItem(value: 'CP', child: Text('CP - Continental Plan (Breakfast)')),
            DropdownMenuItem(value: 'MAP', child: Text('MAP - Modified American (B+D)')),
            DropdownMenuItem(value: 'AP', child: Text('AP - American Plan (All Meals)')),
          ],
          onChanged: (v) => setState(() => _mealPlan = v ?? 'EP'),
        ),
        _textField('confirmationNumber', 'Confirmation Number', icon: Icons.confirmation_number_outlined),
        _textField('guestNames', 'Guest Names (comma-separated)', icon: Icons.people_outlined),
      ],
    );
  }

  Widget _buildTransportFields() {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          initialValue: _vehicleType,
          decoration: const InputDecoration(
            labelText: 'Vehicle Type *',
            border: OutlineInputBorder(),
          ),
          items: ['Sedan', 'SUV', 'Innova', 'Tempo Traveller', 'Mini Bus', 'Bus', 'Luxury Car', 'Bike']
              .map((v) => DropdownMenuItem(value: v, child: Text(v)))
              .toList(),
          onChanged: (v) => setState(() => _vehicleType = v ?? 'Sedan'),
        ),
        const SizedBox(height: AppTheme.spacingMd),
        _textField('driverName', 'Driver Name', icon: Icons.person_outlined),
        _textField('driverPhone', 'Driver Phone',
            icon: Icons.phone_outlined, keyboardType: TextInputType.phone),
        _textField('pickupLocation', 'Pickup Location', icon: Icons.my_location_outlined),
        _dateTimePickerField('pickupTime', 'Pickup Date & Time'),
        _textField('dropLocation', 'Drop Location', icon: Icons.location_on_outlined),
      ],
    );
  }

  Widget _buildFlightFields() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _textField('airline', 'Airline *',
                  validator: _requiredValidator, icon: Icons.airlines_outlined),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(
              child: _textField('flightNumber', 'Flight No.', icon: Icons.flight_outlined),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spacingMd),

        // Departure Airport
        _airportField(isDeparture: true),
        const SizedBox(height: AppTheme.spacingMd),
        _dateTimePickerField('departureTime', 'Departure Date & Time'),

        const SizedBox(height: AppTheme.spacingMd),

        // Arrival Airport
        _airportField(isDeparture: false),
        const SizedBox(height: AppTheme.spacingMd),
        _dateTimePickerField('arrivalTime', 'Arrival Date & Time'),

        const SizedBox(height: AppTheme.spacingMd),
        Row(
          children: [
            Expanded(
              child: _textField('pnr', 'PNR / Booking Ref', icon: Icons.confirmation_number_outlined),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _travelClass,
                decoration: const InputDecoration(
                  labelText: 'Class',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'economy', child: Text('Economy')),
                  DropdownMenuItem(value: 'premium_economy', child: Text('Premium Economy')),
                  DropdownMenuItem(value: 'business', child: Text('Business')),
                  DropdownMenuItem(value: 'first', child: Text('First Class')),
                ],
                onChanged: (v) => setState(() => _travelClass = v ?? 'economy'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildActivityFields() {
    return Column(
      children: [
        _textField('activityName', 'Activity Name *',
            validator: _requiredValidator, icon: Icons.local_activity_outlined),
        _dateTimePickerField('dateTime', 'Date & Time'),
        _textField('meetingPoint', 'Meeting Point', icon: Icons.place_outlined),
        _textField('duration', 'Duration (e.g. 2 hours)', icon: Icons.timer_outlined),
        _textField('operatorContact', 'Operator Contact', icon: Icons.phone_outlined),
      ],
    );
  }

  Widget _buildGenericFields() {
    final fields = <Widget>[];
    _detailsCtrls.forEach((key, ctrl) {
      fields.add(_textField(key, _formatKeyToLabel(key)));
    });
    return Column(children: fields);
  }

  // ── Reusable Field Widgets ────────────────────────────────

  Widget _textField(
    String key,
    String label, {
    String? Function(String?)? validator,
    IconData? icon,
    TextInputType? keyboardType,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: TextFormField(
        controller: _detailsCtrls[key],
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          prefixIcon: icon != null ? Icon(icon) : null,
        ),
        keyboardType: keyboardType,
        validator: validator,
      ),
    );
  }

  Widget _datePickerField(String key, String label, {String? Function(String?)? validator}) {
    return TextFormField(
      controller: _detailsCtrls[key],
      readOnly: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        prefixIcon: const Icon(Icons.calendar_today_outlined),
        suffixIcon: const Icon(Icons.arrow_drop_down),
      ),
      validator: validator,
      onTap: () => _pickDate(_detailsCtrls[key]!),
    );
  }

  Widget _dateTimePickerField(String key, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: TextFormField(
        controller: _detailsCtrls[key],
        readOnly: true,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.schedule_outlined),
          suffixIcon: const Icon(Icons.arrow_drop_down),
        ),
        onTap: () => _pickDateTime(_detailsCtrls[key]!),
      ),
    );
  }

  Widget _airportField({required bool isDeparture}) {
    final airport = isDeparture ? _departureAirport : _arrivalAirport;
    return InkWell(
      onTap: () => _pickAirport(isDeparture: isDeparture),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: isDeparture ? 'Departure Airport' : 'Arrival Airport',
          border: const OutlineInputBorder(),
          prefixIcon: Icon(isDeparture ? Icons.flight_takeoff : Icons.flight_land),
          suffixIcon: const Icon(Icons.search),
        ),
        child: airport != null
            ? Text('${airport.code} - ${airport.city}', style: Theme.of(context).textTheme.bodyLarge)
            : Text('Tap to search...', style: TextStyle(color: Theme.of(context).hintColor)),
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────

  String? _requiredValidator(String? v) => v == null || v.isEmpty ? 'Required' : null;

  String _formatKeyToLabel(String key) {
    return key.replaceAllMapped(
      RegExp(r'[A-Z]'),
      (m) => ' ${m.group(0)}',
    ).replaceFirstMapped(
      RegExp(r'^[a-z]'),
      (m) => m.group(0)!.toUpperCase(),
    );
  }
}
