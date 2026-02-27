import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_provider.dart';

class VehicleFormScreen extends ConsumerStatefulWidget {
  final String? vehicleId;
  const VehicleFormScreen({super.key, this.vehicleId});

  @override
  ConsumerState<VehicleFormScreen> createState() => _VehicleFormScreenState();
}

class _VehicleFormScreenState extends ConsumerState<VehicleFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  final _regController = TextEditingController();
  final _makeController = TextEditingController();
  final _modelController = TextEditingController();
  final _yearController = TextEditingController();
  final _capacityController = TextEditingController();
  final _colorController = TextEditingController();
  final _notesController = TextEditingController();
  String _selectedType = 'sedan';

  bool get _isEdit => widget.vehicleId != null;

  static const _vehicleTypes = {
    'sedan': 'Sedan (4 seater)',
    'suv': 'SUV (6-7 seater)',
    'muv': 'MUV (7-8 seater)',
    'tempo_traveller': 'Tempo Traveller (12-20 seater)',
    'mini_bus': 'Mini Bus (20-30 seater)',
    'bus': 'Bus (40-50 seater)',
    'luxury_coach': 'Luxury Coach (20-40 seater)',
  };

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _loadVehicle();
    } else {
      setState(() => _initializing = false);
    }
  }

  Future<void> _loadVehicle() async {
    try {
      final repo = ref.read(fleetRepositoryProvider);
      final data = await repo.getVehicleDetail(widget.vehicleId!);
      if (!mounted) return;
      setState(() {
        _regController.text = data['registrationNumber'] ?? '';
        _selectedType = data['type'] ?? 'sedan';
        _makeController.text = data['make'] ?? '';
        _modelController.text = data['model'] ?? '';
        _yearController.text = data['year']?.toString() ?? '';
        _capacityController.text = data['seatingCapacity']?.toString() ?? '';
        _colorController.text = data['color'] ?? '';
        _notesController.text = data['notes'] ?? '';
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load vehicle: $e'), backgroundColor: Colors.red),
      );
      context.pop();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      final data = {
        'registrationNumber': _regController.text.trim().toUpperCase(),
        'type': _selectedType,
        if (_makeController.text.isNotEmpty) 'make': _makeController.text.trim(),
        if (_modelController.text.isNotEmpty) 'model': _modelController.text.trim(),
        if (_yearController.text.isNotEmpty) 'year': int.tryParse(_yearController.text),
        if (_capacityController.text.isNotEmpty) 'seatingCapacity': int.tryParse(_capacityController.text),
        if (_colorController.text.isNotEmpty) 'color': _colorController.text.trim(),
        if (_notesController.text.isNotEmpty) 'notes': _notesController.text.trim(),
      };

      final repo = ref.read(fleetRepositoryProvider);
      if (_isEdit) {
        await repo.updateVehicle(widget.vehicleId!, data);
      } else {
        await repo.createVehicle(data);
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isEdit ? 'Vehicle updated' : 'Vehicle created'), backgroundColor: Colors.green),
      );
      ref.read(vehicleListProvider.notifier).load(refresh: true);
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _regController.dispose();
    _makeController.dispose();
    _modelController.dispose();
    _yearController.dispose();
    _capacityController.dispose();
    _colorController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) return const Center(child: CircularProgressIndicator());

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _regController,
              decoration: const InputDecoration(labelText: 'Registration Number *', prefixIcon: Icon(Icons.badge)),
              textCapitalization: TextCapitalization.characters,
              validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _selectedType,
              decoration: const InputDecoration(labelText: 'Vehicle Type *', prefixIcon: Icon(Icons.directions_car)),
              items: _vehicleTypes.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: (v) => setState(() => _selectedType = v!),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _makeController,
                    decoration: const InputDecoration(labelText: 'Make'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _modelController,
                    decoration: const InputDecoration(labelText: 'Model'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _yearController,
                    decoration: const InputDecoration(labelText: 'Year'),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _capacityController,
                    decoration: const InputDecoration(labelText: 'Seating Capacity'),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _colorController,
              decoration: const InputDecoration(labelText: 'Color', prefixIcon: Icon(Icons.palette)),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _notesController,
              decoration: const InputDecoration(labelText: 'Notes', prefixIcon: Icon(Icons.notes)),
              maxLines: 3,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(_isEdit ? 'Update Vehicle' : 'Create Vehicle'),
            ),
          ],
        ),
      ),
    );
  }
}
