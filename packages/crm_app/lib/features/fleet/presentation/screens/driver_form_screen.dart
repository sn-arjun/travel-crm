import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_repository.dart';
import '../../data/fleet_provider.dart';

class DriverFormScreen extends ConsumerStatefulWidget {
  final String? driverId;
  const DriverFormScreen({super.key, this.driverId});
  @override
  ConsumerState<DriverFormScreen> createState() => _DriverFormScreenState();
}

class _DriverFormScreenState extends ConsumerState<DriverFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _licenseController = TextEditingController();
  final _licenseExpiryController = TextEditingController();
  final _addressController = TextEditingController();
  final _emergencyNameController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  final _notesController = TextEditingController();

  bool get _isEdit => widget.driverId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) { _loadDriver(); } else { setState(() => _initializing = false); }
  }

  Future<void> _loadDriver() async {
    try {
      final repo = ref.read(fleetRepositoryProvider);
      final data = await repo.getDriverDetail(widget.driverId!);
      if (!mounted) return;
      setState(() {
        _nameController.text = data['name'] ?? '';
        _phoneController.text = data['phone'] ?? '';
        _emailController.text = data['email'] ?? '';
        _licenseController.text = data['licenseNumber'] ?? '';
        _licenseExpiryController.text = data['licenseExpiry'] ?? '';
        _addressController.text = data['address'] ?? '';
        _emergencyNameController.text = data['emergencyContactName'] ?? '';
        _emergencyPhoneController.text = data['emergencyContactPhone'] ?? '';
        _notesController.text = data['notes'] ?? '';
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load: $e'), backgroundColor: Colors.red));
      context.pop();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final data = {
        'name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        if (_emailController.text.isNotEmpty) 'email': _emailController.text.trim(),
        if (_licenseController.text.isNotEmpty) 'licenseNumber': _licenseController.text.trim(),
        if (_licenseExpiryController.text.isNotEmpty) 'licenseExpiry': _licenseExpiryController.text.trim(),
        if (_addressController.text.isNotEmpty) 'address': _addressController.text.trim(),
        if (_emergencyNameController.text.isNotEmpty) 'emergencyContactName': _emergencyNameController.text.trim(),
        if (_emergencyPhoneController.text.isNotEmpty) 'emergencyContactPhone': _emergencyPhoneController.text.trim(),
        if (_notesController.text.isNotEmpty) 'notes': _notesController.text.trim(),
      };
      final repo = ref.read(fleetRepositoryProvider);
      _isEdit ? await repo.updateDriver(widget.driverId!, data) : await repo.createDriver(data);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_isEdit ? 'Driver updated' : 'Driver created'), backgroundColor: Colors.green));
      ref.read(driverListProvider.notifier).load(refresh: true);
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _pickDate(TextEditingController ctrl) async {
    final date = await showDatePicker(context: context, initialDate: DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2035));
    if (date != null) ctrl.text = date.toIso8601String().split('T')[0];
  }

  @override
  void dispose() {
    _nameController.dispose(); _phoneController.dispose(); _emailController.dispose();
    _licenseController.dispose(); _licenseExpiryController.dispose(); _addressController.dispose();
    _emergencyNameController.dispose(); _emergencyPhoneController.dispose(); _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) return const Center(child: CircularProgressIndicator());
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(key: _formKey, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextFormField(controller: _nameController, decoration: const InputDecoration(labelText: 'Full Name *', prefixIcon: Icon(Icons.person)),
          validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null),
        const SizedBox(height: 16),
        TextFormField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone *', prefixIcon: Icon(Icons.phone)),
          keyboardType: TextInputType.phone, validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null),
        const SizedBox(height: 16),
        TextFormField(controller: _emailController, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email)),
          keyboardType: TextInputType.emailAddress),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: TextFormField(controller: _licenseController, decoration: const InputDecoration(labelText: 'License Number'))),
          const SizedBox(width: 16),
          Expanded(child: TextFormField(controller: _licenseExpiryController, decoration: InputDecoration(labelText: 'License Expiry', suffixIcon: IconButton(icon: const Icon(Icons.calendar_today), onPressed: () => _pickDate(_licenseExpiryController))),
            readOnly: true, onTap: () => _pickDate(_licenseExpiryController))),
        ]),
        const SizedBox(height: 16),
        TextFormField(controller: _addressController, decoration: const InputDecoration(labelText: 'Address', prefixIcon: Icon(Icons.home)), maxLines: 2),
        const SizedBox(height: 16),
        Text('Emergency Contact', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextFormField(controller: _emergencyNameController, decoration: const InputDecoration(labelText: 'Name'))),
          const SizedBox(width: 16),
          Expanded(child: TextFormField(controller: _emergencyPhoneController, decoration: const InputDecoration(labelText: 'Phone'), keyboardType: TextInputType.phone)),
        ]),
        const SizedBox(height: 16),
        TextFormField(controller: _notesController, decoration: const InputDecoration(labelText: 'Notes', prefixIcon: Icon(Icons.notes)), maxLines: 3),
        const SizedBox(height: 24),
        FilledButton(onPressed: _loading ? null : _submit,
          child: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(_isEdit ? 'Update Driver' : 'Create Driver')),
      ])),
    );
  }
}
