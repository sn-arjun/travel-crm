import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/invoice_provider.dart';
import '../../data/invoice_state.dart';
import '../widgets/invoice_status_badge.dart';
import '../widgets/record_payment_dialog.dart';
import '../widgets/send_invoice_dialog.dart';
import '../widgets/tax_summary_section.dart';

class InvoiceDetailScreen extends ConsumerStatefulWidget {
  final String invoiceId;

  const InvoiceDetailScreen({super.key, required this.invoiceId});

  @override
  ConsumerState<InvoiceDetailScreen> createState() =>
      _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends ConsumerState<InvoiceDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(invoiceDetailProvider(widget.invoiceId).notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(invoiceDetailProvider(widget.invoiceId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Invoice Details'),
        actions: [
          if (state.invoice != null && (state.invoice?['status'] as String?)?.toLowerCase() != 'void')
            PopupMenuButton(
              itemBuilder: (context) => [
                PopupMenuItem(
                  child: const Text('Edit'),
                  onTap: () => context.push('/invoices/${widget.invoiceId}/edit'),
                ),
                PopupMenuItem(
                  child: const Text('Send'),
                  onTap: () => _showSendDialog(context, state.invoice!),
                ),
                PopupMenuItem(
                  child: const Text('Download PDF'),
                  onTap: () => _downloadPdf(),
                ),
                PopupMenuItem(
                  child: const Text('Void Invoice'),
                  onTap: () => _showVoidDialog(),
                ),
              ],
            ),
        ],
      ),
      body: _buildBody(context, state, theme),
      floatingActionButton: _buildFAB(state),
    );
  }

  Widget _buildBody(
      BuildContext context, InvoiceDetailState state, ThemeData theme) {
    if (state.status == InvoiceDetailStatus.loading) {
      return const AppLoading();
    }

    if (state.status == InvoiceDetailStatus.error || state.invoice == null) {
      return Center(
        child: Text(state.error ?? 'Failed to load invoice'),
      );
    }

    final invoice = state.invoice!;
    final total = (invoice['total'] as num?)?.toDouble() ?? 0;
    final paidAmount = (invoice['paidAmount'] as num?)?.toDouble() ?? 0;
    final balanceDue = total - paidAmount;
    final subtotal = (invoice['subtotal'] as num?)?.toDouble() ?? 0;
    final discountAmount = (invoice['discountAmount'] as num?)?.toDouble() ?? 0;
    final taxAmount = (invoice['taxAmount'] as num?)?.toDouble() ?? 0;
    final currency = invoice['currency'] as String? ?? 'INR';

    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            AppSectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            invoice['invoiceNumber'] as String? ?? 'N/A',
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Contact: ${invoice['contactName'] as String? ?? 'N/A'}',
                            style: theme.textTheme.bodyMedium,
                          ),
                        ],
                      ),
                      InvoiceStatusBadge(
                        status:
                            (invoice['status'] as String?)?.toUpperCase() ??
                                'DRAFT',
                        type: (invoice['type'] as String?)?.toUpperCase() ??
                            'INVOICE',
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Invoice Date',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          Text(
                            (invoice['invoiceDate'] as String?)
                                    ?.split('T')[0] ??
                                'N/A',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Due Date',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          Text(
                            (invoice['dueDate'] as String?)?.split('T')[0] ??
                                'N/A',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Balance Due',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          Text(
                            '$currency ${balanceDue.toStringAsFixed(2)}',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: balanceDue > 0
                                  ? AppColors.error
                                  : AppColors.success,
                            ),
                          ),
                        ],
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
              child: _buildLineItemsTable(theme, invoice),
            ),

            const SizedBox(height: AppTheme.spacingLg),

            // Tax Summary
            AppSectionCard(
              title: 'Summary',
              child: TaxSummarySection(
                subtotal: subtotal,
                discountAmount: discountAmount,
                taxAmount: taxAmount,
                total: total,
                currency: currency,
                taxType: 'GST',
              ),
            ),

            const SizedBox(height: AppTheme.spacingLg),

            // Payment History
            if (state.payments.isNotEmpty)
              AppSectionCard(
                title: 'Payment History',
                child: _buildPaymentHistory(theme, state.payments),
              ),

            const SizedBox(height: AppTheme.spacingLg),

            // Notes
            if ((invoice['notes'] as String?)?.isNotEmpty ?? false)
              AppSectionCard(
                title: 'Notes',
                child: Text(invoice['notes'] as String),
              ),

            const SizedBox(height: AppTheme.spacingLg),

            // Bank Details
            if ((invoice['bankDetails'] as String?)?.isNotEmpty ?? false)
              AppSectionCard(
                title: 'Bank Details',
                child: Text(invoice['bankDetails'] as String),
              ),

            const SizedBox(height: AppTheme.spacingLg),
          ],
        ),
      ),
    );
  }

  Widget _buildLineItemsTable(ThemeData theme, Map<String, dynamic> invoice) {
    final items = (invoice['lineItems'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    if (items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(16.0),
          child: Text('No line items'),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columns: const [
          DataColumn(label: Text('Description')),
          DataColumn(label: Text('HSN/SAC')),
          DataColumn(label: Text('Qty')),
          DataColumn(label: Text('Rate')),
          DataColumn(label: Text('Amount')),
        ],
        rows: items
            .map((item) => DataRow(cells: [
                  DataCell(Text(item['description'] as String? ?? '')),
                  DataCell(Text(item['hsnSac'] as String? ?? '-')),
                  DataCell(Text(
                      (item['quantity'] as num?)?.toStringAsFixed(2) ?? '0')),
                  DataCell(
                      Text((item['rate'] as num?)?.toStringAsFixed(2) ?? '0')),
                  DataCell(Text(
                      (item['amount'] as num?)?.toStringAsFixed(2) ?? '0')),
                ]))
            .toList(),
      ),
    );
  }

  Widget _buildPaymentHistory(
      ThemeData theme, List<Map<String, dynamic>> payments) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: payments.length,
      itemBuilder: (context, index) {
        final payment = payments[index];
        return Card(
          margin: const EdgeInsets.only(bottom: AppTheme.spacingMd),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      payment['method'] as String? ?? 'Payment',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (payment['paymentDate'] as String?)?.split('T')[0] ?? '',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
                Text(
                  '${payment['amount']}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget? _buildFAB(InvoiceDetailState state) {
    final invoice = state.invoice;
    if (invoice == null) return null;

    final balanceDue =
        ((invoice['total'] as num?)?.toDouble() ?? 0) -
            ((invoice['paidAmount'] as num?)?.toDouble() ?? 0);

    if (balanceDue > 0) {
      return FloatingActionButton.extended(
        onPressed: () => _showRecordPaymentDialog(),
        icon: const Icon(Icons.add_circle_outline),
        label: const Text('Record Payment'),
      );
    }

    return null;
  }

  void _showRecordPaymentDialog() {
    final invoice = ref
        .read(invoiceDetailProvider(widget.invoiceId))
        .invoice;
    if (invoice == null) return;

    final total = (invoice['total'] as num?)?.toDouble() ?? 0;
    final paidAmount = (invoice['paidAmount'] as num?)?.toDouble() ?? 0;
    final currency = invoice['currency'] as String? ?? 'INR';

    showDialog(
      context: context,
      builder: (context) => RecordPaymentDialog(
        invoiceAmount: total,
        paidAmount: paidAmount,
        currency: currency,
        onConfirm: (data) {
          ref
              .read(invoiceDetailProvider(widget.invoiceId).notifier)
              .recordPayment(
                amount: data['amount'],
                method: data['method'],
                type: data['type'],
                referenceNumber: data['referenceNumber'],
                notes: data['notes'],
                paymentDate: data['paymentDate'] != null
                    ? DateTime.parse(data['paymentDate'])
                    : null,
              );
          AppSnackbar.success(context, 'Payment recorded successfully');
        },
      ),
    );
  }

  void _showSendDialog(BuildContext context, Map<String, dynamic> invoice) {
    showDialog(
      context: context,
      builder: (context) => SendInvoiceDialog(
        invoiceNumber: invoice['invoiceNumber'] as String? ?? 'Invoice',
        recipientEmail: invoice['contactEmail'],
        recipientPhone: invoice['contactPhone'],
        onConfirm: (data) {
          ref
              .read(invoiceDetailProvider(widget.invoiceId).notifier)
              .sendInvoice(
                channel: data['channel'],
                email: data['email'],
                phone: data['phone'],
                note: data['note'],
              );
          AppSnackbar.success(context, 'Invoice sent successfully');
        },
      ),
    );
  }

  void _showVoidDialog() async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Void Invoice',
      message: 'Are you sure you want to void this invoice? This action cannot be undone.',
      confirmLabel: 'Void',
      destructive: true,
    );
    if (confirmed && mounted) {
      ref
          .read(invoiceDetailProvider(widget.invoiceId).notifier)
          .voidInvoice();
      AppSnackbar.success(context, 'Invoice voided successfully');
      context.pop();
    }
  }

  Future<void> _downloadPdf() async {
    try {
      await ref
          .read(invoiceRepositoryProvider)
          .getInvoicePdf(widget.invoiceId);
      if (!mounted) return;
      AppSnackbar.success(context, 'PDF downloaded');
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to download PDF');
    }
  }
}
