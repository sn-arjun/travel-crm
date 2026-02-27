import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../../data/models/supplier.dart';
import '../providers/supplier_provider.dart';
import '../../data/repositories/supplier_repository.dart';

class SupplierFormScreen extends ConsumerStatefulWidget {
  final String? supplierId;

  const SupplierFormScreen({super.key, this.supplierId});

  @override
  ConsumerState<SupplierFormScreen> createState() => _SupplierFormScreenState();
}

class _SupplierFormScreenState extends ConsumerState<SupplierFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  bool _isInit = false;

  final _companyController = TextEditingController();
  final _contactPersonController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _countryController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _gstNumberController = TextEditingController();
  final _taxIdController = TextEditingController();
  final _websiteController = TextEditingController();
  final _notesController = TextEditingController();
  
  SupplierCategory _category = SupplierCategory.hotel;
  SupplierStatus _status = SupplierStatus.active;
  bool _isPreferred = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInit && widget.supplierId != null) {
      _loadSupplierData();
    }
  }

  Future<void> _loadSupplierData() async {
    setState(() => _isLoading = true);
    try {
      // Small refactor: using the detail provider briefly or directly fetching 
      // from the repository as we need a localized copy
      final repo = ref.read(supplierRepositoryProvider);
      final supplier = await repo.getSupplier(widget.supplierId!);
      
      if (mounted) {
        setState(() {
          _companyController.text = supplier.companyName;
          _contactPersonController.text = supplier.contactPerson ?? '';
          _emailController.text = supplier.email ?? '';
          _phoneController.text = supplier.phone ?? '';
          _addressController.text = supplier.address ?? '';
          _cityController.text = supplier.city ?? '';
          _stateController.text = supplier.state ?? '';
          _countryController.text = supplier.country ?? '';
          _postalCodeController.text = supplier.postalCode ?? '';
          _gstNumberController.text = supplier.gstNumber ?? '';
          _taxIdController.text = supplier.taxId ?? '';
          _websiteController.text = supplier.website ?? '';
          _notesController.text = supplier.notes ?? '';
          
          _category = supplier.category;
          _status = supplier.status;
          _isPreferred = supplier.isPreferred;
          _isInit = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading supplier: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _companyController.dispose();
    _contactPersonController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _countryController.dispose();
    _postalCodeController.dispose();
    _gstNumberController.dispose();
    _taxIdController.dispose();
    _websiteController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final data = {
      'companyName': _companyController.text,
      if (_contactPersonController.text.isNotEmpty) 'contactPerson': _contactPersonController.text,
      if (_emailController.text.isNotEmpty) 'email': _emailController.text,
      if (_phoneController.text.isNotEmpty) 'phone': _phoneController.text,
      if (_addressController.text.isNotEmpty) 'address': _addressController.text,
      if (_cityController.text.isNotEmpty) 'city': _cityController.text,
      if (_stateController.text.isNotEmpty) 'state': _stateController.text,
      if (_countryController.text.isNotEmpty) 'country': _countryController.text,
      if (_postalCodeController.text.isNotEmpty) 'postalCode': _postalCodeController.text,
      if (_gstNumberController.text.isNotEmpty) 'gstNumber': _gstNumberController.text,
      if (_taxIdController.text.isNotEmpty) 'taxId': _taxIdController.text,
      'category': _category.name,
      if (_websiteController.text.isNotEmpty) 'website': _websiteController.text,
      if (_notesController.text.isNotEmpty) 'notes': _notesController.text,
      'isPreferred': _isPreferred,
      'status': _status.name,
    };

    try {
      final repo = ref.read(supplierRepositoryProvider);
      
      if (widget.supplierId == null) {
        await repo.createSupplier(data);
      } else {
        await repo.updateSupplier(widget.supplierId!, data);
        // Refresh detail cache
        ref.read(supplierDetailProvider(widget.supplierId!).notifier).loadDetails();
      }
      
      // Refresh list cache
      ref.read(supplierListProvider.notifier).loadSuppliers(refresh: true);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(widget.supplierId == null ? 'Supplier created' : 'Supplier updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving supplier: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading && widget.supplierId != null && !_isInit) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isEdit = widget.supplierId != null;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
                  const SizedBox(width: 8),
                  Text(isEdit ? 'Edit Supplier' : 'New Supplier', style: Theme.of(context).textTheme.headlineMedium),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(24.0),
            sliver: SliverToBoxAdapter(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Basic Information', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 2,
                                  child: AppTextField(
                                    label: 'Company Name *',
                                    controller: _companyController,
                                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  flex: 1,
                                  child: AppDropdown<SupplierCategory>(
                                    label: 'Category *',
                                    value: _category,
                                    displayStringFor: (c) => c.name.toUpperCase().replaceAll('_', ' '),
                                    items: SupplierCategory.values,
                                    onChanged: (val) => setState(() => _category = val!),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: AppTextField(
                                    label: 'Contact Person',
                                    controller: _contactPersonController,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppTextField(
                                    label: 'Email',
                                    controller: _emailController,
                                    keyboardType: TextInputType.emailAddress,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppTextField(
                                    label: 'Phone',
                                    controller: _phoneController,
                                    keyboardType: TextInputType.phone,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: AppTextField(
                                    label: 'Website',
                                    controller: _websiteController,
                                    keyboardType: TextInputType.url,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: SwitchListTile(
                                    title: const Text('Is Preferred Supplier?'),
                                    value: _isPreferred,
                                    onChanged: (v) => setState(() => _isPreferred = v),
                                    contentPadding: EdgeInsets.zero,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingLg),
                    
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Location & Compliance', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 2,
                                  child: AppTextField(
                                    label: 'Address',
                                    controller: _addressController,
                                    maxLines: 2,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: Column(
                                    children: [
                                      AppTextField(
                                        label: 'GST Number',
                                        controller: _gstNumberController,
                                      ),
                                      const SizedBox(height: AppTheme.spacingMd),
                                      AppTextField(
                                        label: 'Tax / PAN ID',
                                        controller: _taxIdController,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'City', controller: _cityController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'State', controller: _stateController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Country', controller: _countryController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Postal Code', controller: _postalCodeController)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingLg),
                    
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Additional Data', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            AppTextField(
                              label: 'Notes',
                              controller: _notesController,
                              maxLines: 4,
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            AppDropdown<SupplierStatus>(
                              label: 'System Status',
                              value: _status,
                                displayStringFor: (s) => s.name.toUpperCase(),
                                items: SupplierStatus.values,
                                onChanged: (val) => setState(() => _status = val!),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingXl),
                    
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => context.pop(),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        ElevatedButton(
                          onPressed: _isLoading ? null : _submit,
                          child: _isLoading 
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(isEdit ? 'Update Supplier' : 'Create Supplier'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
