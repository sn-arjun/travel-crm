import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../../data/repositories/traveller_repository.dart';
import '../providers/traveller_provider.dart';

class TravellerFormScreen extends ConsumerStatefulWidget {
  final String? travellerId;
  final String? initialContactId;

  const TravellerFormScreen({super.key, this.travellerId, this.initialContactId});

  @override
  ConsumerState<TravellerFormScreen> createState() => _TravellerFormScreenState();
}

class _TravellerFormScreenState extends ConsumerState<TravellerFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  bool _isInit = false;

  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _fullNamePassportController = TextEditingController();
  final _dobController = TextEditingController();
  final _nationalityController = TextEditingController();
  final _passportNumberController = TextEditingController();
  final _passportIssueController = TextEditingController();
  final _passportExpiryController = TextEditingController();
  final _passportIssuingCountryController = TextEditingController();
  final _mealController = TextEditingController();
  final _seatController = TextEditingController();
  final _roomController = TextEditingController();
  final _medicalController = TextEditingController();
  final _emergencyNameController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  final _emergencyRelController = TextEditingController();
  
  String? _gender;
  String? _contactId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInit) {
      _contactId = widget.initialContactId;
      if (widget.travellerId != null) {
        _loadTravellerData();
      } else {
        _isInit = true;
      }
    }
  }

  Future<void> _loadTravellerData() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(travellerRepositoryProvider);
      final traveller = await repo.getTraveller(widget.travellerId!);
      
      if (mounted) {
        setState(() {
          _contactId = traveller.contactId;
          _firstNameController.text = traveller.firstName;
          _lastNameController.text = traveller.lastName;
          _fullNamePassportController.text = traveller.fullNamePassport;
          _dobController.text = traveller.dateOfBirth ?? '';
          _nationalityController.text = traveller.nationality ?? '';
          _passportNumberController.text = traveller.passportNumber ?? '';
          _passportIssueController.text = traveller.passportIssueDate ?? '';
          _passportExpiryController.text = traveller.passportExpiryDate ?? '';
          _passportIssuingCountryController.text = traveller.passportIssuingCountry ?? '';
          _mealController.text = traveller.mealPreference ?? '';
          _seatController.text = traveller.seatPreference ?? '';
          _roomController.text = traveller.roomPreference ?? '';
          _medicalController.text = traveller.medicalNotes ?? '';
          _emergencyNameController.text = traveller.emergencyContactName ?? '';
          _emergencyPhoneController.text = traveller.emergencyContactPhone ?? '';
          _emergencyRelController.text = traveller.emergencyContactRelationship ?? '';
          _gender = traveller.gender;
          
          _isInit = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading traveller: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _fullNamePassportController.dispose();
    _dobController.dispose();
    _nationalityController.dispose();
    _passportNumberController.dispose();
    _passportIssueController.dispose();
    _passportExpiryController.dispose();
    _passportIssuingCountryController.dispose();
    _mealController.dispose();
    _seatController.dispose();
    _roomController.dispose();
    _medicalController.dispose();
    _emergencyNameController.dispose();
    _emergencyPhoneController.dispose();
    _emergencyRelController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final data = {
      if (_contactId != null) 'contactId': _contactId,
      'firstName': _firstNameController.text,
      'lastName': _lastNameController.text,
      'fullNamePassport': _fullNamePassportController.text.isNotEmpty 
          ? _fullNamePassportController.text 
          : '${_firstNameController.text} ${_lastNameController.text}',
      if (_dobController.text.isNotEmpty) 'dateOfBirth': _dobController.text,
      if (_gender != null) 'gender': _gender,
      if (_nationalityController.text.isNotEmpty) 'nationality': _nationalityController.text,
      if (_passportNumberController.text.isNotEmpty) 'passportNumber': _passportNumberController.text,
      if (_passportIssueController.text.isNotEmpty) 'passportIssueDate': _passportIssueController.text,
      if (_passportExpiryController.text.isNotEmpty) 'passportExpiryDate': _passportExpiryController.text,
      if (_passportIssuingCountryController.text.isNotEmpty) 'passportIssuingCountry': _passportIssuingCountryController.text,
      if (_mealController.text.isNotEmpty) 'mealPreference': _mealController.text,
      if (_seatController.text.isNotEmpty) 'seatPreference': _seatController.text,
      if (_roomController.text.isNotEmpty) 'roomPreference': _roomController.text,
      if (_medicalController.text.isNotEmpty) 'medicalNotes': _medicalController.text,
      if (_emergencyNameController.text.isNotEmpty) 'emergencyContactName': _emergencyNameController.text,
      if (_emergencyPhoneController.text.isNotEmpty) 'emergencyContactPhone': _emergencyPhoneController.text,
      if (_emergencyRelController.text.isNotEmpty) 'emergencyContactRelationship': _emergencyRelController.text,
    };

    try {
      final repo = ref.read(travellerRepositoryProvider);
      
      if (widget.travellerId == null) {
        await repo.createTraveller(data);
      } else {
        await repo.updateTraveller(widget.travellerId!, data);
      }
      
      ref.read(travellerListProvider.notifier).loadTravellers(refresh: true);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(widget.travellerId == null ? 'Traveller created' : 'Traveller updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving traveller: $e')),
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
    if (_isLoading && widget.travellerId != null && !_isInit) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isEdit = widget.travellerId != null;

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
                  Text(isEdit ? 'Edit Traveller' : 'New Traveller', style: Theme.of(context).textTheme.headlineMedium),
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
                                  child: AppTextField(
                                    label: 'First Name *',
                                    controller: _firstNameController,
                                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppTextField(
                                    label: 'Last Name *',
                                    controller: _lastNameController,
                                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            AppTextField(
                              label: 'Full Name as per Passport (If different)',
                              controller: _fullNamePassportController,
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: AppTextField(
                                    label: 'Date of Birth (YYYY-MM-DD)',
                                    controller: _dobController,
                                    hint: 'e.g. 1990-05-15',
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppDropdown<String?>(
                                    label: 'Gender',
                                    value: _gender,
                                    displayStringFor: (g) => g != null ? g[0].toUpperCase() + g.substring(1) : 'Not Specified',
                                    items: const [null, 'male', 'female', 'other'],
                                    onChanged: (v) => setState(() => _gender = v),
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
                            Text('Passport Details', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Passport Number', controller: _passportNumberController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Nationality', controller: _nationalityController)),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Issue Date (YYYY-MM-DD)', controller: _passportIssueController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Expiry Date (YYYY-MM-DD)', controller: _passportExpiryController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Issuing Country', controller: _passportIssuingCountryController)),
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
                            Text('Preferences & Notes', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Meal Preference', controller: _mealController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Seat Preference', controller: _seatController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Room Preference', controller: _roomController)),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            AppTextField(
                              label: 'Medical Notes & Allergies',
                              controller: _medicalController,
                              maxLines: 2,
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Text('Emergency Contact', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: AppTheme.spacingSm),
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Name', controller: _emergencyNameController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Phone', controller: _emergencyPhoneController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Relationship', controller: _emergencyRelController)),
                              ],
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
                            : Text(isEdit ? 'Update Traveller' : 'Create Traveller'),
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
