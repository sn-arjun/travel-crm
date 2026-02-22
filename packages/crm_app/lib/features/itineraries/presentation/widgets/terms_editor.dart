import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Editor for itinerary terms & conditions, validity date, and
/// payment terms (TICKET-088).
///
/// Provides a multiline text field for the terms body, a date picker
/// for validity, and a payment terms field. A "Load from Settings"
/// button is included as a placeholder to load tenant-level defaults
/// from the settings API in the future.
class TermsEditor extends StatefulWidget {
  final String? termsConditions;
  final String? validityDate;
  final ValueChanged<String?> onTermsChanged;
  final ValueChanged<String?> onValidityDateChanged;

  const TermsEditor({
    super.key,
    this.termsConditions,
    this.validityDate,
    required this.onTermsChanged,
    required this.onValidityDateChanged,
  });

  @override
  State<TermsEditor> createState() => _TermsEditorState();
}

class _TermsEditorState extends State<TermsEditor> {
  late final TextEditingController _termsController;
  late final TextEditingController _paymentTermsController;
  late final TextEditingController _validityController;

  @override
  void initState() {
    super.initState();
    _termsController = TextEditingController(text: widget.termsConditions ?? '');
    _paymentTermsController = TextEditingController();
    _validityController = TextEditingController(text: widget.validityDate ?? '');
  }

  @override
  void didUpdateWidget(covariant TermsEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.termsConditions != widget.termsConditions &&
        _termsController.text != (widget.termsConditions ?? '')) {
      _termsController.text = widget.termsConditions ?? '';
    }
    if (oldWidget.validityDate != widget.validityDate &&
        _validityController.text != (widget.validityDate ?? '')) {
      _validityController.text = widget.validityDate ?? '';
    }
  }

  @override
  void dispose() {
    _termsController.dispose();
    _paymentTermsController.dispose();
    _validityController.dispose();
    super.dispose();
  }

  Future<void> _pickValidityDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: widget.validityDate != null
          ? DateTime.tryParse(widget.validityDate!) ?? now
          : now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      final formatted =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      _validityController.text = formatted;
      widget.onValidityDateChanged(formatted);
    }
  }

  void _loadFromSettings() {
    // Placeholder: In the future, this will fetch default terms from
    // the tenant settings API and populate the fields.
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text('Loading from settings will be available soon.'),
          duration: Duration(seconds: 2),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with Load from Settings button
          Row(
            children: [
              Icon(
                Icons.description_outlined,
                size: 20,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Text(
                'Terms & Conditions',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              OutlinedButton.icon(
                icon: const Icon(Icons.download_outlined, size: 16),
                label: const Text('Load from Settings'),
                onPressed: _loadFromSettings,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spacingSm,
                    vertical: AppTheme.spacingXs,
                  ),
                  textStyle: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMd),

          // Terms body
          TextField(
            controller: _termsController,
            decoration: const InputDecoration(
              hintText:
                  'Enter terms and conditions...\n\n'
                  'e.g. Cancellation policy, booking conditions, '
                  'liability disclaimers, etc.',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
            maxLines: 10,
            minLines: 6,
            onChanged: (value) {
              widget.onTermsChanged(value.isEmpty ? null : value);
            },
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // Validity date
          Text(
            'Validity Date',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          TextField(
            controller: _validityController,
            readOnly: true,
            decoration: InputDecoration(
              hintText: 'Select validity date',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: const Icon(Icons.calendar_today_outlined, size: 18),
                onPressed: _pickValidityDate,
              ),
            ),
            onTap: _pickValidityDate,
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text(
            'The itinerary quote will be valid until this date.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // Payment terms
          Text(
            'Payment Terms',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          TextField(
            controller: _paymentTermsController,
            decoration: const InputDecoration(
              hintText:
                  'e.g. 50% advance at the time of booking, '
                  'balance 15 days before travel...',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
            maxLines: 4,
            minLines: 2,
          ),
          const SizedBox(height: AppTheme.spacingXl),
        ],
      ),
    );
  }
}
