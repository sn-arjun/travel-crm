import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../../contacts/data/contact_provider.dart';
import '../../../leads/data/lead_provider.dart';
import '../../data/invoice_provider.dart';
import '../widgets/line_item_editor.dart';
import '../widgets/tax_summary_section.dart';

class InvoiceFormScreen extends ConsumerStatefulWidget {
  final String? invoiceId;

  const InvoiceFormScreen({super.key, this.invoiceId});

  @override
  ConsumerState<InvoiceFormScreen> createState() =>
      _InvoiceFormScreenState();
}

class _InvoiceFormScreenState extends ConsumerState<InvoiceFormScreen> {
  late TextEditingController _invoiceNumberCtrl;
  late TextEditingController _contactCtrl;
  late TextEditingController _leadCtrl;
  late TextEditingController _typeCtrl;
  late TextEditingController _invoiceDateCtrl;
  late TextEditingController _dueDateCtrl;
  late TextEditingController _currencyCtrl;
  late TextEditingController _discountCtrl;
  late TextEditingController _taxRateCtrl;
  late TextEditingController _notesCtrl;
  late TextEditingController _bankDetailsCtrl;

  List<LineItem> _lineItems = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _invoiceNumberCtrl = TextEditingController();
    _contactCtrl = TextEditingController();
    _leadCtrl = TextEditingController();
    _typeCtrl = TextEditingController(text: 'invoice');
    _invoiceDateCtrl = TextEditingController(
      text: DateTime.now().toIso8601String().split('T')[0],
    );
    _dueDateCtrl = TextEditingController(
      text: DateTime.now()
          .add(const Duration(days: 30))
          .toIso8601String()
          .split('T')[0],
    );
    _currencyCtrl = TextEditingController(text: 'INR');
    _discountCtrl = TextEditingController(text: '0');
    _taxRateCtrl = TextEditingController(text: '18');
    _notesCtrl = TextEditingController();
    _bankDetailsCtrl = TextEditingController();

    if (widget.invoiceId != null) {
      _loadInvoice(widget.invoiceId!);
    }
  }

  @override
  void dispose() {
    _invoiceNumberCtrl.dispose();
    _contactCtrl.dispose();
    _leadCtrl.dispose();
    _typeCtrl.dispose();
    _invoiceDateCtrl.dispose();
    _dueDateCtrl.dispose();
    _currencyCtrl.dispose();
    _discountCtrl.dispose();
    _taxRateCtrl.dispose();
    _notesCtrl.dispose();
    _bankDetailsCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInvoice(String invoiceId) async {
    setState(() => _isLoading = true);
    try {
      final invoice = await ref
          .read(invoiceRepositoryProvider)
          .getInvoice(invoiceId);

      _invoiceNumberCtrl.text = invoice['invoiceNumber'] ?? '';
      _contactCtrl.text = invoice['contactName'] ?? '';
      _typeCtrl.text = invoice['type'] ?? 'invoice';
      _invoiceDateCtrl.text =
          (invoice['invoiceDate'] as String?)?.split('T')[0] ?? '';
      _dueDateCtrl.text =
          (invoice['dueDate'] as String?)?.split('T')[0] ?? '';
      _currencyCtrl.text = invoice['currency'] ?? 'INR';
      _discountCtrl.text = (invoice['discountAmount'] ?? 0).toString();
      _taxRateCtrl.text = (invoice['taxRate'] ?? 0).toString();
      _notesCtrl.text = invoice['notes'] ?? '';
      _bankDetailsCtrl.text = invoice['bankDetails'] ?? '';

      if (invoice['lineItems'] is List) {
        _lineItems = (invoice['lineItems'] as List)
            .map((item) => LineItem(
                  id: item['id'],
                  description: item['description'] ?? '',
                  hsnSac: item['hsnSac'],
                  quantity: (item['quantity'] as num?)?.toDouble() ?? 1,
                  rate: (item['rate'] as num?)?.toDouble() ?? 0,
                  discountPercent:
                      (item['discountPercent'] as num?)?.toDouble(),
                  taxRate: (item['taxRate'] as num?)?.toDouble(),
                ))
            .toList();
      }
    } catch (e) {
      AppSnackbar.error(context, 'Failed to load invoice');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _selectDate(
    BuildContext context,
    TextEditingController controller,
  ) async {
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(controller.text),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );

    if (selected != null) {
      controller.text = selected.toIso8601String().split('T')[0];
    }
  }

  Future<void> _submit() async {
    if (_contactCtrl.text.isEmpty) {
      AppSnackbar.error(context, 'Please select a contact');
      return;
    }

    if (_lineItems.isEmpty) {
      AppSnackbar.error(context, 'Please add at least one item');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final data = {
        'invoiceNumber': _invoiceNumberCtrl.text,
        'type': _typeCtrl.text,
        'invoiceDate': _invoiceDateCtrl.text,
        'dueDate': _dueDateCtrl.text,
        'currency': _currencyCtrl.text,
        'discountAmount': double.tryParse(_discountCtrl.text) ?? 0,
        'taxRate': double.tryParse(_taxRateCtrl.text) ?? 0,
        'notes': _notesCtrl.text,
        'bankDetails': _bankDetailsCtrl.text,
        'lineItems': _lineItems
            .map((item) => {
                  'description': item.description,
                  'hsnSac': item.hsnSac,
                  'quantity': item.quantity,
                  'rate': item.rate,
                  'discountPercent': item.discountPercent,
                  'taxRate': item.taxRate,
                })
            .toList(),
      };

      if (widget.invoiceId != null) {
        await ref
            .read(invoiceRepositoryProvider)
            .updateInvoice(widget.invoiceId!, data);
        AppSnackbar.success(context, 'Invoice updated successfully');
      } else {
        await ref
            .read(invoiceRepositoryProvider)
            .createInvoice(data);
        AppSnackbar.success(context, 'Invoice created successfully');
      }

      if (mounted) {
        context.pop();
      }
    } catch (e) {
      AppSnackbar.error(context, 'Failed to save invoice');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_isLoading && widget.invoiceId != null && _lineItems.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Loading Invoice')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Calculate totals
    final subtotal = _lineItems.fold<double>(
        0, (sum, item) => sum + item.amountAfterDiscount);
    final discountAmount = double.tryParse(_discountCtrl.text) ?? 0;
    final taxAmount = subtotal * ((double.tryParse(_taxRateCtrl.text) ?? 0) / 100);
    final total = subtotal + taxAmount;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.invoiceId != null ? 'Edit Invoice' : 'Create Invoice'),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Basic Info Section
              AppSectionCard(
                title: 'Invoice Details',
                child: Column(
                  children: [
                    TextField(
                      controller: _invoiceNumberCtrl,
                      decoration: InputDecoration(
                        labelText: 'Invoice Number',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.spacingMd,
                          vertical: AppTheme.spacingSm,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    TextField(
                      controller: _contactCtrl,
                      decoration: InputDecoration(
                        labelText: 'Contact',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.spacingMd,
                          vertical: AppTheme.spacingSm,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: _typeCtrl.text,
                            decoration: InputDecoration(
                              labelText: 'Type',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                            ),
                            items: ['invoice', 'credit-note', 'debit-note']
                                .map((t) =>
                                    DropdownMenuItem(value: t, child: Text(t)))
                                .toList(),
                            onChanged: (value) {
                              if (value != null) _typeCtrl.text = value;
                            },
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: _currencyCtrl.text,
                            decoration: InputDecoration(
                              labelText: 'Currency',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                            ),
                            items: ['INR', 'USD', 'EUR', 'GBP']
                                .map((c) =>
                                    DropdownMenuItem(value: c, child: Text(c)))
                                .toList(),
                            onChanged: (value) {
                              if (value != null) _currencyCtrl.text = value;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _invoiceDateCtrl,
                            readOnly: true,
                            onTap: () => _selectDate(context, _invoiceDateCtrl),
                            decoration: InputDecoration(
                              labelText: 'Invoice Date',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                              suffixIcon: const Icon(Icons.calendar_today),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        Expanded(
                          child: TextField(
                            controller: _dueDateCtrl,
                            readOnly: true,
                            onTap: () => _selectDate(context, _dueDateCtrl),
                            decoration: InputDecoration(
                              labelText: 'Due Date',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                              suffixIcon: const Icon(Icons.calendar_today),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              // Line Items
              AppSectionCard(
                title: 'Line Items',
                child: LineItemEditor(
                  items: _lineItems,
                  onItemsChanged: (items) {
                    setState(() => _lineItems = items);
                  },
                ),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              // Tax & Summary
              AppSectionCard(
                title: 'Discount & Tax',
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _discountCtrl,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            decoration: InputDecoration(
                              labelText: 'Discount Amount',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: AppTheme.spacingMd),
                        Expanded(
                          child: TextField(
                            controller: _taxRateCtrl,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                    decimal: true),
                            decoration: InputDecoration(
                              labelText: 'Tax Rate (%)',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: AppTheme.spacingMd,
                                vertical: AppTheme.spacingSm,
                              ),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppTheme.spacingLg),
                    TaxSummarySection(
                      subtotal: subtotal,
                      discountAmount: discountAmount,
                      taxAmount: taxAmount,
                      total: total,
                      currency: _currencyCtrl.text,
                      taxType: 'GST',
                    ),
                  ],
                ),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              // Notes & Bank Details
              AppSectionCard(
                title: 'Additional Information',
                child: Column(
                  children: [
                    TextField(
                      controller: _notesCtrl,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: 'Notes',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.spacingMd,
                          vertical: AppTheme.spacingSm,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                    TextField(
                      controller: _bankDetailsCtrl,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: 'Bank Details',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.spacingMd,
                          vertical: AppTheme.spacingSm,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: AppTheme.spacingLg),

              // Action buttons
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
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _submit,
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              widget.invoiceId != null
                                  ? 'Update Invoice'
                                  : 'Create Invoice',
                            ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: AppTheme.spacingLg),
            ],
          ),
        ),
      ),
    );
  }
}
