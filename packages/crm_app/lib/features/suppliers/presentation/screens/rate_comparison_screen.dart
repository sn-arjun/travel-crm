import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../../../core/widgets/forms/app_dropdown.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../data/models/supplier_rate_card.dart';
import 'package:shared/api_client/api_endpoints.dart';
import '../../../auth/data/auth_provider.dart';

class RateComparisonScreen extends ConsumerStatefulWidget {
  const RateComparisonScreen({super.key});

  @override
  ConsumerState<RateComparisonScreen> createState() => _RateComparisonScreenState();
}

class _RateComparisonScreenState extends ConsumerState<RateComparisonScreen> {
  final _serviceTypeController = TextEditingController();
  final _destinationController = TextEditingController();
  RateCardSeason? _season;
  
  List<dynamic> _results = [];
  bool _isLoading = false;

  Future<void> _compareRates() async {
    if (_serviceTypeController.text.isEmpty || _destinationController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Service Type and Destination are required')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final apiClient = ref.read(apiClientProvider);
      final params = {
        'service_type': _serviceTypeController.text,
        'destination': _destinationController.text,
        if (_season != null) 'season': _season!.name,
      };

      final response = await apiClient.get(
        '${ApiEndpoints.suppliers}/compare-rates', // Using custom extension to api client
        queryParameters: params,
      );

      setState(() {
        _results = response.data['data'] as List<dynamic>;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Rate Comparison', style: Theme.of(context).textTheme.headlineMedium),
                ElevatedButton(onPressed: () => context.pop(), child: const Text('Back')),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                Expanded(
                  child: AppTextField(
                    label: 'Service Type (e.g. accommodation)',
                    controller: _serviceTypeController,
                  ),
                ),
                const SizedBox(width: AppTheme.spacingMd),
                Expanded(
                  child: AppTextField(
                    label: 'Destination',
                    controller: _destinationController,
                  ),
                ),
                const SizedBox(width: AppTheme.spacingMd),
                Expanded(
                  child: SizedBox(
                    width: 150,
                    child: AppDropdown<RateCardSeason?>(
                      label: 'Season',
                      value: _season,
                      displayStringFor: (s) => s?.name.toUpperCase() ?? 'Any',
                      items: [null, ...RateCardSeason.values],
                      onChanged: (v) => setState(() => _season = v),
                    ),
                  ),
                ),
                const SizedBox(width: AppTheme.spacingMd),
                Padding(
                  padding: const EdgeInsets.only(top: 24.0),
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _compareRates,
                    child: _isLoading 
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Compare Rates'),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _results.isEmpty && !_isLoading
              ? const Center(child: Text('Enter criteria and click Compare Rates to see results.'))
              : AppDataTable<dynamic>(
                  rows: _results,
                  columns: [
                    AppDataColumn(
                      title: 'Supplier',
                      field: 'supplier',
                      cellBuilder: (value) {
                        final rate = value as dynamic;
                        return InkWell(
                          onTap: () => context.go('/suppliers/${rate["supplier_id"]}'),
                          child: Text(
                            rate['company_name'] ?? 'Unknown',
                            style: const TextStyle(
                              color: AppTheme.primaryColor,
                              fontWeight: FontWeight.bold,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        );
                      }
                    ),
                    AppDataColumn(
                      title: 'Rate Card Name',
                      field: 'name',
                      cellBuilder: (value) => Text((value as dynamic)['name'] as String)
                    ),
                    AppDataColumn(
                      title: 'Rating',
                      field: 'rating',
                      cellBuilder: (value) => Text((value as dynamic)['rating'] != null ? '${(value as dynamic)["rating"]} ★' : '-')
                    ),
                    AppDataColumn(
                      title: 'Cost Price',
                      field: 'cost',
                      cellBuilder: (value) => Text('${(value as dynamic)["currency"]} ${(value as dynamic)["cost_price"]}')
                    ),
                    AppDataColumn(
                      title: 'Unit',
                      field: 'unit',
                      cellBuilder: (value) => Text(((value as dynamic)['unit'] as String).replaceAll('_', ' ').toUpperCase())
                    ),
                    AppDataColumn(
                      title: 'Validity',
                      field: 'validity',
                      cellBuilder: (value) => Text('${(value as dynamic)["valid_from"] ?? "Anytime"} to ${(value as dynamic)["valid_to"] ?? "Anytime"}')
                    ),
                  ],
                  rowValueFor: (rate, field) => rate,
              ),
          ),
        ],
      ),
    );
  }
}
