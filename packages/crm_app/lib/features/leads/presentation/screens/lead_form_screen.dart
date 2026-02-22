import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/lead_provider.dart';
import '../widgets/contact_selector.dart';
import '../widgets/destination_input.dart';
import '../widgets/trip_type_selector.dart';
import '../widgets/budget_input.dart';
import '../widgets/assignee_selector.dart';

class LeadFormScreen extends ConsumerStatefulWidget {
  final String? leadId;   // null = create mode
  final String? contactId; // pre-fill from contact

  const LeadFormScreen({super.key, this.leadId, this.contactId});

  @override
  ConsumerState<LeadFormScreen> createState() => _LeadFormScreenState();
}

class _LeadFormScreenState extends ConsumerState<LeadFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _initializing = true;

  // Form fields
  String? _contactId;
  String? _contactName;
  String _title = '';
  List<String> _destinations = [];
  String _travelDate = '';
  String? _returnDate;
  int _paxAdults = 1;
  int _paxChildren = 0;
  int _paxInfants = 0;
  double? _budget;
  String _currency = 'INR';
  String _tripType = 'international';
  String _source = 'manual';
  String? _priority;
  String? _assignedTo;
  String? _travelClass;
  String? _hotelPreference;
  String? _mealPreference;
  String? _specialRequirements;
  String? _notes;

  bool get _isEdit => widget.leadId != null;

  @override
  void initState() {
    super.initState();
    _contactId = widget.contactId;
    if (_isEdit) {
      _loadLead();
    } else {
      setState(() => _initializing = false);
    }
  }

  Future<void> _loadLead() async {
    try {
      final repo = ref.read(leadRepositoryProvider);
      final lead = await repo.getLead(widget.leadId!);
      setState(() {
        _contactId = lead.contactId;
        _contactName = lead.contactName;
        _title = lead.title;
        _destinations = List.from(lead.destinations);
        _travelDate = lead.travelDate;
        _returnDate = lead.returnDate;
        _paxAdults = lead.paxAdults;
        _paxChildren = lead.paxChildren;
        _paxInfants = lead.paxInfants;
        _budget = lead.budget;
        _currency = lead.currency;
        _tripType = lead.tripType;
        _source = lead.source;
        _priority = lead.priority;
        _assignedTo = lead.assignedTo;
        _travelClass = lead.travelClass;
        _hotelPreference = lead.hotelPreference;
        _mealPreference = lead.mealPreference;
        _specialRequirements = lead.specialRequirements;
        _notes = lead.notes;
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to load lead');
      context.pop();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_contactId == null) {
      AppSnackbar.error(context, 'Please select a contact');
      return;
    }
    if (_destinations.isEmpty) {
      AppSnackbar.error(context, 'Please add at least one destination');
      return;
    }
    _formKey.currentState!.save();
    setState(() => _loading = true);

    try {
      final repo = ref.read(leadRepositoryProvider);
      final data = {
        'contactId': _contactId,
        'title': _title,
        'destinations': _destinations,
        'travelDate': _travelDate,
        if (_returnDate != null) 'returnDate': _returnDate,
        'paxAdults': _paxAdults,
        'paxChildren': _paxChildren,
        'paxInfants': _paxInfants,
        if (_budget != null) 'budget': _budget,
        'currency': _currency,
        'tripType': _tripType,
        'source': _source,
        if (_priority != null) 'priority': _priority,
        if (_assignedTo != null) 'assignedTo': _assignedTo,
        if (_travelClass != null) 'travelClass': _travelClass,
        if (_hotelPreference != null) 'hotelPreference': _hotelPreference,
        if (_mealPreference != null) 'mealPreference': _mealPreference,
        if (_specialRequirements != null) 'specialRequirements': _specialRequirements,
        if (_notes != null) 'notes': _notes,
      };

      if (_isEdit) {
        await repo.updateLead(widget.leadId!, data);
        if (!mounted) return;
        AppSnackbar.success(context, 'Lead updated');
        context.pop();
      } else {
        final lead = await repo.createLead(data);
        if (!mounted) return;
        AppSnackbar.success(context, 'Lead created');
        ref.read(pipelineProvider.notifier).load();
        context.go('/leads/${lead.id}');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      AppSnackbar.error(context, 'Failed to save lead');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Edit Lead' : 'New Lead'),
        actions: [
          TextButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(_isEdit ? 'Save' : 'Create'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Contact ──────────────────────────────────
              AppSectionCard(
                title: 'Contact',
                child: ContactSelector(
                  contactId: _contactId,
                  contactName: _contactName,
                  onChanged: (contact) => setState(() {
                    _contactId = contact?.id;
                    _contactName = contact?.name;
                  }),
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),

              // ── Trip Details ─────────────────────────────
              AppSectionCard(
                title: 'Trip Details',
                child: Column(
                  children: [
                    TextFormField(
                      initialValue: _title,
                      decoration: const InputDecoration(
                        labelText: 'Lead Title *',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          v == null || v.isEmpty ? 'Required' : null,
                      onSaved: (v) => _title = v ?? '',
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DestinationInput(
                      destinations: _destinations,
                      onChanged: (dests) =>
                          setState(() => _destinations = dests),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    TripTypeSelector(
                      value: _tripType,
                      onChanged: (v) => setState(() => _tripType = v ?? _tripType),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            initialValue: _travelDate,
                            decoration: const InputDecoration(
                              labelText: 'Travel Date *',
                              border: OutlineInputBorder(),
                              hintText: 'YYYY-MM-DD',
                            ),
                            validator: (v) =>
                                v == null || v.isEmpty ? 'Required' : null,
                            onSaved: (v) => _travelDate = v ?? '',
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        Expanded(
                          child: TextFormField(
                            initialValue: _returnDate,
                            decoration: const InputDecoration(
                              labelText: 'Return Date',
                              border: OutlineInputBorder(),
                              hintText: 'YYYY-MM-DD',
                            ),
                            onSaved: (v) =>
                                _returnDate = v?.isEmpty == true ? null : v,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    Row(
                      children: [
                        Expanded(
                          child: _PaxField(
                            label: 'Adults',
                            value: _paxAdults,
                            min: 1,
                            onChanged: (v) => setState(() => _paxAdults = v),
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingSm),
                        Expanded(
                          child: _PaxField(
                            label: 'Children',
                            value: _paxChildren,
                            onChanged: (v) => setState(() => _paxChildren = v),
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingSm),
                        Expanded(
                          child: _PaxField(
                            label: 'Infants',
                            value: _paxInfants,
                            onChanged: (v) => setState(() => _paxInfants = v),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),

              // ── Preferences ──────────────────────────────
              AppSectionCard(
                title: 'Preferences',
                child: Column(
                  children: [
                    BudgetInput(
                      amount: _budget,
                      currency: _currency,
                      onAmountChanged: (v) => setState(() => _budget = v),
                      onCurrencyChanged: (v) => setState(() => _currency = v),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DropdownButtonFormField<String>(
                      initialValue: _travelClass,
                      decoration: const InputDecoration(
                        labelText: 'Travel Class',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'economy', child: Text('Economy')),
                        DropdownMenuItem(value: 'business', child: Text('Business')),
                        DropdownMenuItem(value: 'first', child: Text('First Class')),
                      ],
                      onChanged: (v) => setState(() => _travelClass = v),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DropdownButtonFormField<String>(
                      initialValue: _hotelPreference,
                      decoration: const InputDecoration(
                        labelText: 'Hotel Preference',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'budget', child: Text('Budget')),
                        DropdownMenuItem(value: 'standard', child: Text('Standard')),
                        DropdownMenuItem(value: 'premium', child: Text('Premium')),
                        DropdownMenuItem(value: 'luxury', child: Text('Luxury')),
                      ],
                      onChanged: (v) => setState(() => _hotelPreference = v),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DropdownButtonFormField<String>(
                      initialValue: _mealPreference,
                      decoration: const InputDecoration(
                        labelText: 'Meal Preference',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'veg', child: Text('Vegetarian')),
                        DropdownMenuItem(value: 'non_veg', child: Text('Non-Vegetarian')),
                        DropdownMenuItem(value: 'vegan', child: Text('Vegan')),
                        DropdownMenuItem(value: 'jain', child: Text('Jain')),
                      ],
                      onChanged: (v) => setState(() => _mealPreference = v),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    TextFormField(
                      initialValue: _specialRequirements,
                      decoration: const InputDecoration(
                        labelText: 'Special Requirements',
                        border: OutlineInputBorder(),
                      ),
                      maxLines: 2,
                      onSaved: (v) => _specialRequirements =
                          v?.isEmpty == true ? null : v,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),

              // ── Source & Assignment ───────────────────────
              AppSectionCard(
                title: 'Source & Assignment',
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _source,
                      decoration: const InputDecoration(
                        labelText: 'Lead Source',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'manual', child: Text('Manual')),
                        DropdownMenuItem(value: 'website', child: Text('Website')),
                        DropdownMenuItem(value: 'facebook', child: Text('Facebook')),
                        DropdownMenuItem(value: 'google', child: Text('Google')),
                        DropdownMenuItem(value: 'referral', child: Text('Referral')),
                        DropdownMenuItem(value: 'walkin', child: Text('Walk-in')),
                      ],
                      onChanged: (v) => setState(() => _source = v ?? 'manual'),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    DropdownButtonFormField<String>(
                      initialValue: _priority,
                      decoration: const InputDecoration(
                        labelText: 'Priority',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: null, child: Text('None')),
                        DropdownMenuItem(value: 'hot', child: Text('Hot')),
                        DropdownMenuItem(value: 'warm', child: Text('Warm')),
                        DropdownMenuItem(value: 'cold', child: Text('Cold')),
                      ],
                      onChanged: (v) => setState(() => _priority = v),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    AssigneeSelector(
                      value: _assignedTo,
                      onChanged: (id) => setState(() => _assignedTo = id),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),

              // ── Notes ────────────────────────────────────
              AppSectionCard(
                title: 'Notes',
                child: TextFormField(
                  initialValue: _notes,
                  decoration: const InputDecoration(
                    hintText: 'Any additional notes...',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 4,
                  onSaved: (v) => _notes = v?.isEmpty == true ? null : v,
                ),
              ),
              const SizedBox(height: AppTheme.spacingXl),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaxField extends StatelessWidget {
  final String label;
  final int value;
  final int min;
  final ValueChanged<int> onChanged;

  const _PaxField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.min = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 4),
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.remove, size: 18),
              onPressed: value > min ? () => onChanged(value - 1) : null,
              style: IconButton.styleFrom(
                minimumSize: const Size(32, 32),
                padding: EdgeInsets.zero,
              ),
            ),
            SizedBox(
              width: 32,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
            IconButton(
              icon: const Icon(Icons.add, size: 18),
              onPressed: () => onChanged(value + 1),
              style: IconButton.styleFrom(
                minimumSize: const Size(32, 32),
                padding: EdgeInsets.zero,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
