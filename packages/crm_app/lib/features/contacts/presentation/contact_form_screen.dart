import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/feedback/app_snackbar.dart';
import '../../../core/widgets/forms/app_dropdown.dart';
import '../../../core/widgets/forms/app_text_field.dart';
import '../../../core/widgets/layout/app_section_card.dart';
import '../data/contact_provider.dart';
import 'widgets/tag_chips.dart';

class ContactFormScreen extends ConsumerStatefulWidget {
  final String? contactId;

  const ContactFormScreen({super.key, this.contactId});

  bool get isEditing => contactId != null;

  @override
  ConsumerState<ContactFormScreen> createState() => _ContactFormScreenState();
}

class _ContactFormScreenState extends ConsumerState<ContactFormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  bool _loaded = false;

  // Controllers
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _companyCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _countryCtrl = TextEditingController();
  final _postalCodeCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _birthdayCtrl = TextEditingController();
  final _anniversaryCtrl = TextEditingController();

  String _type = 'customer';
  String? _source;
  String _language = 'en';
  List<String> _tags = [];

  // Duplicate warning
  bool _hasDuplicate = false;

  @override
  void initState() {
    super.initState();
    if (widget.isEditing) {
      _loadContact();
    }
  }

  Future<void> _loadContact() async {
    try {
      final contact = await ref
          .read(contactRepositoryProvider)
          .getContact(widget.contactId!);
      if (!mounted) return;
      setState(() {
        _nameCtrl.text = contact.name;
        _emailCtrl.text = contact.email ?? '';
        _phoneCtrl.text = contact.phone ?? '';
        _companyCtrl.text = contact.company ?? '';
        _addressCtrl.text = contact.address ?? '';
        _cityCtrl.text = contact.city ?? '';
        _stateCtrl.text = contact.state ?? '';
        _countryCtrl.text = contact.country ?? '';
        _postalCodeCtrl.text = contact.postalCode ?? '';
        _notesCtrl.text = contact.notes ?? '';
        _birthdayCtrl.text = contact.birthday ?? '';
        _anniversaryCtrl.text = contact.anniversary ?? '';
        _type = contact.type;
        _source = contact.source;
        _language = contact.preferredLanguage;
        _tags = List.from(contact.tags);
        _loaded = true;
      });
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to load contact');
        context.pop();
      }
    }
  }

  Future<void> _checkDuplicate() async {
    final email = _emailCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    if (email.isEmpty && phone.isEmpty) return;

    try {
      final result = await ref.read(contactRepositoryProvider).checkDuplicate(
            email: email.isNotEmpty ? email : null,
            phone: phone.isNotEmpty ? phone : null,
          );
      if (mounted) {
        setState(() => _hasDuplicate = result.hasDuplicates);
      }
    } catch (_) {
      // Non-critical
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _saving = true);

    final data = <String, dynamic>{
      'name': _nameCtrl.text.trim(),
      'type': _type,
      'tags': _tags,
      'preferredLanguage': _language,
      if (_emailCtrl.text.trim().isNotEmpty) 'email': _emailCtrl.text.trim(),
      if (_phoneCtrl.text.trim().isNotEmpty) 'phone': _phoneCtrl.text.trim(),
      if (_companyCtrl.text.trim().isNotEmpty) 'company': _companyCtrl.text.trim(),
      if (_addressCtrl.text.trim().isNotEmpty) 'address': _addressCtrl.text.trim(),
      if (_cityCtrl.text.trim().isNotEmpty) 'city': _cityCtrl.text.trim(),
      if (_stateCtrl.text.trim().isNotEmpty) 'state': _stateCtrl.text.trim(),
      if (_countryCtrl.text.trim().isNotEmpty) 'country': _countryCtrl.text.trim(),
      if (_postalCodeCtrl.text.trim().isNotEmpty) 'postalCode': _postalCodeCtrl.text.trim(),
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
      if (_source != null) 'source': _source,
      if (_birthdayCtrl.text.trim().isNotEmpty) 'birthday': _birthdayCtrl.text.trim(),
      if (_anniversaryCtrl.text.trim().isNotEmpty) 'anniversary': _anniversaryCtrl.text.trim(),
    };

    try {
      final repo = ref.read(contactRepositoryProvider);
      ContactModel contact;

      if (widget.isEditing) {
        contact = await repo.updateContact(widget.contactId!, data);
        if (mounted) AppSnackbar.success(context, 'Contact updated');
      } else {
        contact = await repo.createContact(data);
        if (mounted) AppSnackbar.success(context, 'Contact created');
      }

      if (mounted) {
        ref.read(contactListProvider.notifier).loadContacts(refresh: true);
        context.go('/contacts/${contact.id}');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(
          context,
          e is ApiException ? e.message : 'Failed to save contact',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate(TextEditingController controller) async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (date != null && mounted) {
      controller.text =
          '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _companyCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _countryCtrl.dispose();
    _postalCodeCtrl.dispose();
    _notesCtrl.dispose();
    _birthdayCtrl.dispose();
    _anniversaryCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isEditing && !_loaded) {
      return const Center(child: CircularProgressIndicator());
    }

    final allTags = ref.watch(contactTagsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEditing ? 'Edit Contact' : 'New Contact'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(widget.isEditing ? 'Update' : 'Create'),
          ),
          const SizedBox(width: AppTheme.spacingMd),
        ],
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTheme.spacingLg),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: Column(
                children: [
                  // Duplicate warning
                  if (_hasDuplicate)
                    Container(
                      margin: const EdgeInsets.only(bottom: AppTheme.spacingMd),
                      padding: const EdgeInsets.all(AppTheme.spacingMd),
                      decoration: BoxDecoration(
                        color: AppTheme.warningColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                        border: Border.all(color: AppTheme.warningColor.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.warning_amber, color: AppTheme.warningColor),
                          const SizedBox(width: AppTheme.spacingSm),
                          Expanded(
                            child: Text(
                              'A contact with this email or phone already exists.',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Basic Info
                  AppSectionCard(
                    title: 'Basic Information',
                    child: Column(
                      children: [
                        AppTextField(
                          controller: _nameCtrl,
                          label: 'Full Name *',
                          prefixIcon: Icons.person_outline,
                          validator: (v) => v == null || v.trim().isEmpty ? 'Name is required' : null,
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        Row(
                          children: [
                            Expanded(
                              child: AppTextField(
                                controller: _emailCtrl,
                                label: 'Email',
                                prefixIcon: Icons.email_outlined,
                                keyboardType: TextInputType.emailAddress,
                                onChanged: (_) => _checkDuplicate(),
                              ),
                            ),
                            const SizedBox(width: AppTheme.spacingMd),
                            Expanded(
                              child: AppTextField(
                                controller: _phoneCtrl,
                                label: 'Phone',
                                prefixIcon: Icons.phone_outlined,
                                keyboardType: TextInputType.phone,
                                onChanged: (_) => _checkDuplicate(),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        AppTextField(
                          controller: _companyCtrl,
                          label: 'Company',
                          prefixIcon: Icons.business_outlined,
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        Row(
                          children: [
                            Expanded(
                              child: AppDropdown<String>(
                                label: 'Type *',
                                items: const ['customer', 'supplier', 'agent', 'partner'],
                                value: _type,
                                displayStringFor: (v) => v[0].toUpperCase() + v.substring(1),
                                onChanged: (v) {
                                  if (v != null) setState(() => _type = v);
                                },
                              ),
                            ),
                            const SizedBox(width: AppTheme.spacingMd),
                            Expanded(
                              child: AppDropdown<String>(
                                label: 'Source',
                                items: const ['manual', 'website', 'referral', 'ad', 'facebook', 'google'],
                                value: _source,
                                displayStringFor: (v) => v[0].toUpperCase() + v.substring(1),
                                onChanged: (v) => setState(() => _source = v),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),

                  // Address
                  AppSectionCard(
                    title: 'Address',
                    child: Column(
                      children: [
                        AppTextField(
                          controller: _addressCtrl,
                          label: 'Address',
                          prefixIcon: Icons.location_on_outlined,
                          maxLines: 2,
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        Row(
                          children: [
                            Expanded(
                              child: AppTextField(controller: _cityCtrl, label: 'City'),
                            ),
                            const SizedBox(width: AppTheme.spacingMd),
                            Expanded(
                              child: AppTextField(controller: _stateCtrl, label: 'State'),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        Row(
                          children: [
                            Expanded(
                              child: AppTextField(controller: _countryCtrl, label: 'Country'),
                            ),
                            const SizedBox(width: AppTheme.spacingMd),
                            Expanded(
                              child: AppTextField(controller: _postalCodeCtrl, label: 'Postal Code'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),

                  // Preferences
                  AppSectionCard(
                    title: 'Preferences & Occasions',
                    child: Column(
                      children: [
                        AppDropdown<String>(
                          label: 'Preferred Language',
                          items: const ['en', 'hi', 'mr', 'gu', 'ta', 'te', 'bn', 'pa', 'ur', 'ar', 'fr', 'de', 'es'],
                          value: _language,
                          displayStringFor: (v) => _languageName(v),
                          onChanged: (v) {
                            if (v != null) setState(() => _language = v);
                          },
                        ),
                        const SizedBox(height: AppTheme.spacingMd),
                        Row(
                          children: [
                            Expanded(
                              child: AppTextField(
                                controller: _birthdayCtrl,
                                label: 'Birthday',
                                prefixIcon: Icons.cake_outlined,
                                readOnly: true,
                                onTap: () => _pickDate(_birthdayCtrl),
                              ),
                            ),
                            const SizedBox(width: AppTheme.spacingMd),
                            Expanded(
                              child: AppTextField(
                                controller: _anniversaryCtrl,
                                label: 'Anniversary',
                                prefixIcon: Icons.favorite_outline,
                                readOnly: true,
                                onTap: () => _pickDate(_anniversaryCtrl),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),

                  // Tags
                  AppSectionCard(
                    title: 'Tags',
                    child: TagAutocompleteField(
                      allTags: allTags.valueOrNull ?? [],
                      selectedTags: _tags,
                      onChanged: (tags) => setState(() => _tags = tags),
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingMd),

                  // Notes
                  AppSectionCard(
                    title: 'Notes',
                    child: AppTextField(
                      controller: _notesCtrl,
                      label: 'Notes',
                      maxLines: 4,
                      prefixIcon: Icons.notes_outlined,
                    ),
                  ),
                  const SizedBox(height: AppTheme.spacingXl),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _languageName(String code) {
    const names = {
      'en': 'English', 'hi': 'Hindi', 'mr': 'Marathi', 'gu': 'Gujarati',
      'ta': 'Tamil', 'te': 'Telugu', 'bn': 'Bengali', 'pa': 'Punjabi',
      'ur': 'Urdu', 'ar': 'Arabic', 'fr': 'French', 'de': 'German', 'es': 'Spanish',
    };
    return names[code] ?? code.toUpperCase();
  }
}
