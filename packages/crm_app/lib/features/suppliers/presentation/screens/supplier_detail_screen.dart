import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:shared/api_client/api_endpoints.dart';
import '../../../auth/data/auth_provider.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../providers/supplier_provider.dart';
import '../../data/models/supplier.dart';
import '../../data/models/supplier_rate_card.dart';

class SupplierDetailScreen extends ConsumerStatefulWidget {
  final String supplierId;

  const SupplierDetailScreen({super.key, required this.supplierId});

  @override
  ConsumerState<SupplierDetailScreen> createState() => _SupplierDetailScreenState();
}

class _SupplierDetailScreenState extends ConsumerState<SupplierDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(supplierDetailProvider(widget.supplierId));

    if (state.isLoading && state.supplier == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (state.error != null && state.supplier == null) {
      return Scaffold(body: Center(child: Text('Error: ${state.error}')));
    }

    final supplier = state.supplier!;

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
                    const SizedBox(width: 8),
                    Text('Supplier Details', style: Theme.of(context).textTheme.headlineMedium),
                  ],
                ),
                ElevatedButton(
                  onPressed: () => context.go('/suppliers/${supplier.id}/edit'),
                  child: const Text('Edit Supplier'),
                ),
              ],
            ),
          ),
          
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingLg),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              supplier.category.name.toUpperCase(),
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                            ),
                          ),
                          const SizedBox(width: AppTheme.spacingSm),
                          if (supplier.isPreferred)
                            const Icon(Icons.star, color: Colors.amber, size: 20),
                        ],
                      ),
                      const SizedBox(height: AppTheme.spacingSm),
                      Text(
                        '${supplier.city ?? ""}, ${supplier.country ?? ""}',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppTheme.colorGrey500),
                      ),
                    ],
                  ),
                ),
                
                // Contact Quick Actions
                if (supplier.email != null)
                  IconButton(
                    icon: const Icon(Icons.email_outlined),
                    tooltip: supplier.email,
                    onPressed: () {},
                  ),
                if (supplier.phone != null)
                  IconButton(
                    icon: const Icon(Icons.phone_outlined),
                    tooltip: supplier.phone,
                    onPressed: () {},
                  ),
                if (supplier.website != null)
                  IconButton(
                    icon: const Icon(Icons.language),
                    tooltip: supplier.website,
                    onPressed: () {},
                  ),
              ],
            ),
          ),
          
          const SizedBox(height: AppTheme.spacingLg),
          TabBar(
            controller: _tabController,
            labelColor: AppTheme.primaryColor,
            unselectedLabelColor: AppTheme.colorGrey500,
            indicatorColor: AppTheme.primaryColor,
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Rate Cards'),
              Tab(text: 'Ledger & Payments'),
            ],
          ),
          
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildOverviewTab(supplier),
                _buildRateCardsTab(state.rateCards),
                _buildLedgerTab(state),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOverviewTab(Supplier supplier) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildInfoSection('Contact Details', [
                  _InfoRow('Contact Person', supplier.contactPerson ?? '-'),
                  _InfoRow('Email', supplier.email ?? '-'),
                  _InfoRow('Phone', supplier.phone ?? '-'),
                  _InfoRow('Website', supplier.website ?? '-'),
                ]),
                const SizedBox(height: AppTheme.spacingLg),
                _buildInfoSection('Location & Compliance', [
                  _InfoRow('Address', supplier.address ?? '-'),
                  _InfoRow('City/State', '${supplier.city ?? "-"} / ${supplier.state ?? "-"}'),
                  _InfoRow('Country', supplier.country ?? '-'),
                  _InfoRow('Postal Code', supplier.postalCode ?? '-'),
                  _InfoRow('GST Number', supplier.gstNumber ?? '-'),
                  _InfoRow('Tax/PAN ID', supplier.taxId ?? '-'),
                ]),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.spacingLg),
          Expanded(
            flex: 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildInfoSection('System Information', [
                  _InfoRow('Status', supplier.status.name.toUpperCase()),
                  _InfoRow('Rating', supplier.rating.toStringAsFixed(1)),
                  _InfoRow('Preferred Provider', supplier.isPreferred ? 'Yes' : 'No'),
                  _InfoRow('Created At', supplier.createdAt != null ? DateFormat.yMMMd().format(supplier.createdAt!) : '-'),
                ]),
                const SizedBox(height: AppTheme.spacingLg),
                if (supplier.notes != null && supplier.notes!.isNotEmpty)
                  _buildInfoSection('Notes', [
                    Text(supplier.notes!),
                  ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoSection(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(24.0),
      decoration: BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.colorGrey200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: AppTheme.spacingMd),
          ...children,
        ],
      ),
    );
  }

  Widget _buildRateCardsTab(List<SupplierRateCard> rateCards) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          ElevatedButton.icon(
            onPressed: () => _showAddRateCardDialog(),
            icon: const Icon(Icons.add),
            label: const Text('Add Rate Card'),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Expanded(
            child: rateCards.isEmpty 
              ? const Center(child: Text('No rate cards found for this supplier.'))
              : AppDataTable<SupplierRateCard>(
                  rows: rateCards,
                  columns: [
                    AppDataColumn(
                      title: 'Service / Name',
                      field: 'name',
                      cellBuilder: (value) {
                        final rate = value as SupplierRateCard;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(rate.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text(rate.serviceType.toUpperCase(), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        );
                      }
                    ),
                    AppDataColumn(
                      title: 'Destination / Season',
                      field: 'destination',
                      cellBuilder: (value) {
                         final rate = value as SupplierRateCard;
                         return Text('${rate.destination ?? "-"}\n${rate.season?.name.toUpperCase() ?? "-"}');
                      }
                    ),
                    AppDataColumn(
                      title: 'Cost / Selling Price',
                      field: 'price',
                      cellBuilder: (value) {
                         final rate = value as SupplierRateCard;
                         return Text('${rate.currency} ${rate.costPrice} / ${rate.sellingPrice ?? "-"}');
                      }
                    ),
                    AppDataColumn(
                      title: 'Unit',
                      field: 'unit',
                      cellBuilder: (value) {
                         final rate = value as SupplierRateCard;
                         return Text(rate.unit.name.replaceAll('_', ' ').toUpperCase());
                      }
                    ),
                    AppDataColumn(
                      title: 'Validity',
                      field: 'validity',
                      cellBuilder: (value) {
                         final rate = value as SupplierRateCard;
                         return Text('${rate.validFrom ?? "Anytime"} to ${rate.validTo ?? "Anytime"}');
                      }
                    ),
                  ],
                  rowValueFor: (rate, field) => rate,
              ),
          ),
        ],
      ),
    );
  }

  Widget _buildLedgerTab(dynamic state) { // SupplierDetailState
    final currencyFormat = NumberFormat.currency(symbol: '₹', decimalDigits: 2);
    
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
               Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Total Paid Out', style: TextStyle(color: AppTheme.colorGrey500)),
                  Text(
                    currencyFormat.format(state.totalPaid), 
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.successColor),
                  ),
                ],
              ),
              ElevatedButton.icon(
                onPressed: () => _showAddPaymentDialog(),
                icon: const Icon(Icons.payment),
                label: const Text('Record Payment'),
              ),
            ],
          ),
          
          const SizedBox(height: AppTheme.spacingLg),
          
          Expanded(
            child: state.ledgerEntries.isEmpty 
              ? const Center(child: Text('No ledger entries found.'))
              : AppDataTable<dynamic>(
                  rows: state.ledgerEntries,
                  columns: [
                    AppDataColumn(
                      title: 'Date',
                      field: 'date',
                      cellBuilder: (value) {
                         final entry = value as dynamic;
                         return Text(DateFormat.yMMMd().format(DateTime.parse(entry.date)));
                      }
                    ),
                    AppDataColumn(
                      title: 'Description',
                      field: 'description',
                      cellBuilder: (value) {
                         final entry = value as dynamic;
                         return Text(entry.description);
                      }
                    ),
                    AppDataColumn(
                      title: 'Type',
                      field: 'type',
                      cellBuilder: (value) {
                         final entry = value as dynamic;
                         return Text(entry.entryType.toUpperCase(), 
                           style: TextStyle(color: entry.entryType == 'credit' ? AppTheme.successColor : AppTheme.errorColor)
                         );
                      }
                    ),
                    AppDataColumn(
                      title: 'Amount',
                      field: 'amount',
                      cellBuilder: (value) {
                         final entry = value as dynamic;
                         return Text(currencyFormat.format(entry.entryType == 'credit' ? entry.creditAmount : entry.debitAmount));
                      }
                    ),
                    AppDataColumn(
                      title: 'Running Balance',
                      field: 'balance',
                      cellBuilder: (value) {
                         final entry = value as dynamic;
                         return Text(currencyFormat.format(entry.runningBalance), style: const TextStyle(fontWeight: FontWeight.bold));
                      }
                    ),
                  ],
                  rowValueFor: (entry, field) => entry,
              ),
          ),
        ],
      ),
    );
  }

  void _showAddRateCardDialog() {
    showDialog(
      context: context,
      builder: (ctx) => _AddRateCardDialog(supplierId: widget.supplierId),
    );
  }

  void _showAddPaymentDialog() {
    showDialog(
      context: context,
      builder: (ctx) => _AddPaymentDialog(supplierId: widget.supplierId),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  
  const _InfoRow(this.label, this.value);
  
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text(label, style: const TextStyle(color: AppTheme.colorGrey500))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

class _AddRateCardDialog extends ConsumerStatefulWidget {
  final String supplierId;
  const _AddRateCardDialog({required this.supplierId});

  @override
  ConsumerState<_AddRateCardDialog> createState() => _AddRateCardDialogState();
}

class _AddRateCardDialogState extends ConsumerState<_AddRateCardDialog> {
    final _nameController = TextEditingController();
    final _serviceTypeController = TextEditingController();
    final _costController = TextEditingController();
    RateCardUnit _unit = RateCardUnit.perNight;

    @override
    Widget build(BuildContext context) {
      return AlertDialog(
        title: const Text('Add Rate Card'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
               AppTextField(label: 'Name (e.g. Deluxe Room)', controller: _nameController),
               const SizedBox(height: 12),
               AppTextField(label: 'Service Type (e.g. accommodation)', controller: _serviceTypeController),
               const SizedBox(height: 12),
               AppTextField(label: 'Cost (INR)', controller: _costController, keyboardType: TextInputType.number),
               const SizedBox(height: 12),
               AppDropdown<RateCardUnit>(
                  label: 'Unit',
                  value: _unit,
                  displayStringFor: (u) => u.name.toUpperCase(),
                  items: RateCardUnit.values,
                  onChanged: (u) => setState(() => _unit = u!),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => context.pop(), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final apiClient = ref.read(apiClientProvider);
              await apiClient.post(ApiEndpoints.supplierRateCards(widget.supplierId), data: {
                'name': _nameController.text,
                'service_type': _serviceTypeController.text,
                'cost_price': double.tryParse(_costController.text) ?? 0,
                'unit': _unit.name,
              });
              ref.read(supplierDetailProvider(widget.supplierId).notifier).fetchRateCards();
              if (!mounted) return;
              if (context.mounted) context.pop();
            },
            child: const Text('Save'),
          ),
        ],
      );
    }
}

class _AddPaymentDialog extends ConsumerStatefulWidget {
  final String supplierId;
  const _AddPaymentDialog({required this.supplierId});

  @override
  ConsumerState<_AddPaymentDialog> createState() => _AddPaymentDialogState();
}

class _AddPaymentDialogState extends ConsumerState<_AddPaymentDialog> {
    final _amountController = TextEditingController();
    final _methodController = TextEditingController();
    final _refController = TextEditingController();

    @override
    Widget build(BuildContext context) {
      return AlertDialog(
        title: const Text('Record Payment'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
               AppTextField(label: 'Amount (INR)', controller: _amountController, keyboardType: TextInputType.number),
               const SizedBox(height: 12),
               AppTextField(label: 'Method (e.g. bank_transfer)', controller: _methodController),
               const SizedBox(height: 12),
               AppTextField(label: 'Reference Number', controller: _refController),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => context.pop(), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(supplierDetailProvider(widget.supplierId).notifier).recordPayment({
                  'amount': double.tryParse(_amountController.text) ?? 0,
                  'method': _methodController.text,
                  'reference_number': _refController.text,
                  'payment_date': DateTime.now().toIso8601String(),
                });
                if (!mounted) return;
                if (context.mounted) context.pop();
              } catch (e) {
                 if (!mounted) return;
                 if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
              }
            },
            child: const Text('Save'),
          ),
        ],
      );
    }
}
