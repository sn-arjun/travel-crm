import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../../data/models/visa_application.dart';
import '../../data/repositories/visa_repository.dart';
import '../providers/visa_provider.dart';

class VisaFormScreen extends ConsumerStatefulWidget {
  final String? visaId;
  final String? initialTravellerId;

  const VisaFormScreen({super.key, this.visaId, this.initialTravellerId});

  @override
  ConsumerState<VisaFormScreen> createState() => _VisaFormScreenState();
}

class _VisaFormScreenState extends ConsumerState<VisaFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  bool _isInit = false;

  final _travellerIdController = TextEditingController(); // Basic for now, really should be a selector widget
  final _destinationController = TextEditingController();
  final _applicationNumberController = TextEditingController();
  final _embassyController = TextEditingController();
  final _notesController = TextEditingController();
  
  // Dates
  final _appliedDateController = TextEditingController();
  final _appointmentDateController = TextEditingController();
  final _expectedDateController = TextEditingController();

  VisaType _visaType = VisaType.tourist;
  VisaEntryType _entryType = VisaEntryType.single;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInit) {
      if (widget.initialTravellerId != null) {
        _travellerIdController.text = widget.initialTravellerId!;
      }
      if (widget.visaId != null) {
        _loadVisaData();
      } else {
        _isInit = true;
      }
    }
  }

  Future<void> _loadVisaData() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(visaRepositoryProvider);
      final details = await repo.getVisaApplicationDetails(widget.visaId!);
      final visa = details['visa'] as VisaApplication;
      
      if (mounted) {
        setState(() {
          _travellerIdController.text = visa.travellerId;
          _destinationController.text = visa.destinationCountry;
          _applicationNumberController.text = visa.applicationNumber ?? '';
          _embassyController.text = visa.embassyName ?? '';
          _notesController.text = visa.notes ?? '';
          _appliedDateController.text = visa.appliedDate ?? '';
          _appointmentDateController.text = visa.appointmentDate ?? '';
          _expectedDateController.text = visa.expectedDate ?? '';
          
          _visaType = visa.visaType;
          _entryType = visa.visaEntryType ?? VisaEntryType.single;
          
          _isInit = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading visa: $e')),
        );
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final data = {
      'travellerId': _travellerIdController.text,
      'destinationCountry': _destinationController.text,
      'visaType': _visaType.name,
      'visaEntryType': _entryType.name,
      if (_applicationNumberController.text.isNotEmpty) 'applicationNumber': _applicationNumberController.text,
      if (_embassyController.text.isNotEmpty) 'embassyName': _embassyController.text,
      if (_notesController.text.isNotEmpty) 'notes': _notesController.text,
      if (_appliedDateController.text.isNotEmpty) 'appliedDate': _appliedDateController.text,
      if (_appointmentDateController.text.isNotEmpty) 'appointmentDate': _appointmentDateController.text,
      if (_expectedDateController.text.isNotEmpty) 'expectedDate': _expectedDateController.text,
    };

    try {
      final repo = ref.read(visaRepositoryProvider);
      
      if (widget.visaId == null) {
        await repo.createVisaApplication(data);
      } else {
        await repo.updateVisaApplication(widget.visaId!, data);
      }
      
      ref.read(visaListProvider.notifier).loadVisas(refresh: true);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(widget.visaId == null ? 'Visa application created' : 'Visa application updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving visa: $e')),
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
    if (_isLoading && widget.visaId != null && !_isInit) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isEdit = widget.visaId != null;

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
                  Text(isEdit ? 'Edit Application' : 'New Application', style: Theme.of(context).textTheme.headlineMedium),
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
                            Text('Core Information', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: AppTextField(
                                    label: 'Traveller ID (Contact/Traveller ID) *',
                                    controller: _travellerIdController,
                                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppTextField(
                                    label: 'Destination Country *',
                                    controller: _destinationController,
                                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: AppDropdown<VisaType>(
                                    label: 'Visa Type',
                                    value: _visaType,
                                    displayStringFor: (t) => t.name.toUpperCase(),
                                    items: VisaType.values,
                                    onChanged: (v) => setState(() => _visaType = v!),
                                  ),
                                ),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(
                                  child: AppDropdown<VisaEntryType>(
                                    label: 'Entry Type',
                                    value: _entryType,
                                    displayStringFor: (t) => t.name.toUpperCase(),
                                    items: VisaEntryType.values,
                                    onChanged: (v) => setState(() => _entryType = v!),
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
                            Text('Tracking & Dates', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Application Number', controller: _applicationNumberController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Embassy/Consulate Name', controller: _embassyController)),
                              ],
                            ),
                            const SizedBox(height: AppTheme.spacingMd),
                            
                            Row(
                              children: [
                                Expanded(child: AppTextField(label: 'Applied Date (YYYY-MM-DD)', controller: _appliedDateController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Appointment Date', controller: _appointmentDateController)),
                                const SizedBox(width: AppTheme.spacingMd),
                                Expanded(child: AppTextField(label: 'Expected Date', controller: _expectedDateController)),
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
                            Text('Internal Notes', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppTheme.spacingLg),
                            AppTextField(
                              label: 'Visa specific notes',
                              controller: _notesController,
                              maxLines: 3,
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
                            : Text(isEdit ? 'Update Application' : 'Create Application'),
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
