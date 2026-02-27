import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../data/models/supplier.dart';
import '../providers/supplier_provider.dart';

class SupplierListScreen extends ConsumerWidget {
  const SupplierListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(supplierListProvider);
    final notifier = ref.read(supplierListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Suppliers', style: Theme.of(context).textTheme.headlineMedium),
                ElevatedButton(
                  onPressed: () => context.go('/suppliers/new'),
                  child: const Text('Add Supplier'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search suppliers...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => notifier.updateFilters(search: value),
            ),
          ),
          const SizedBox(height: 8),
          AppFilterBar<String>(
            onClear: () => notifier.clearFilters(),
            selectedValue: state.categoryFilter,
            onFilterChanged: (value) => notifier.updateFilters(category: value),
            filters: const [
              FilterItem(label: 'Hotel', value: 'hotel'),
              FilterItem(label: 'Transport', value: 'transport'),
              FilterItem(label: 'Airline', value: 'airline'),
              FilterItem(label: 'Activity Provider', value: 'activity_provider'),
              FilterItem(label: 'Guide', value: 'guide'),
              FilterItem(label: 'Visa Agent', value: 'visa_agent'),
              FilterItem(label: 'Insurance', value: 'insurance'),
            ],
          ),
          AppFilterBar<String>(
            selectedValue: state.statusFilter,
            onFilterChanged: (value) => notifier.updateFilters(status: value),
            filters: const [
              FilterItem(label: 'Active', value: 'active'),
              FilterItem(label: 'Inactive', value: 'inactive'),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Expanded(
            child: (state.isLoading && state.suppliers.isEmpty)
              ? const Center(child: CircularProgressIndicator())
              : AppDataTable<Supplier>(
                  rows: state.suppliers,
              columns: [
                AppDataColumn(
                  title: 'Company',
                  field: 'company',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Row(
                          children: [
                            if (supplier.isPreferred) 
                              const Icon(Icons.star, color: Colors.amber, size: 16),
                            if (supplier.isPreferred) 
                              const SizedBox(width: 4),
                            Text(supplier.companyName, style: const TextStyle(fontWeight: FontWeight.w500)),
                          ],
                        ),
                        if (supplier.email != null) ...[
                          const SizedBox(height: 2),
                          Text(supplier.email!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.colorGrey500)),
                        ],
                      ],
                    );
                  }
                ),
                AppDataColumn(
                  title: 'Category',
                  field: 'category',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Text(supplier.category.name.toUpperCase());
                  }
                ),
                AppDataColumn(
                  title: 'City & Country',
                  field: 'location',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Text('${supplier.city ?? "-"}, ${supplier.country ?? "-"}');
                  }
                ),
                AppDataColumn(
                  title: 'Rating',
                  field: 'rating',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Text('${supplier.rating} ★');
                  }
                ),
                AppDataColumn(
                  title: 'Status',
                  field: 'status',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: supplier.status == SupplierStatus.active
                          ? AppTheme.successColor.withValues(alpha: 0.1)
                          : AppTheme.colorGrey200,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        supplier.status.name.toUpperCase(),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: supplier.status == SupplierStatus.active
                            ? AppTheme.successColor
                            : AppTheme.colorGrey500,
                        ),
                      ),
                    );
                  }
                ),
                AppDataColumn(
                  title: 'Actions',
                  field: 'actions',
                  cellBuilder: (value) {
                    final supplier = value as Supplier;
                    return Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.visibility, size: 20),
                          onPressed: () => context.go('/suppliers/${supplier.id}'),
                          tooltip: 'View Details',
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit, size: 20),
                          onPressed: () => context.go('/suppliers/${supplier.id}/edit'),
                          tooltip: 'Edit',
                        ),
                      ],
                    );
                  }
                ),
              ],
              rowValueFor: (supplier, field) => supplier,
              onPageChanged: (page) {
                if (page > state.currentPage && !state.isLoading) {
                  notifier.loadNextPage();
                }
              },
            ),
          ),
        ],
      ),
    );
  }

}
