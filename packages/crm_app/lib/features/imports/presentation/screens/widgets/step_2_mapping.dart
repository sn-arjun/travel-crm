import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/import_wizard_provider.dart';

class Step2Mapping extends ConsumerWidget {
  const Step2Mapping({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importWizardProvider);
    final notifier = ref.read(importWizardProvider.notifier);

    if (state.currentJob == null) {
      return const Text('Please upload a file first.');
    }

    final crmFields = _getCrmFields(state.selectedType);
    final fileColumns = state.columnMapping.keys.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Map Columns',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 8),
        const Text('The system has tried to auto-map your columns. Please review and adjust the mappings before proceeding.'),
        const SizedBox(height: 16),
        
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: fileColumns.length,
          itemBuilder: (context, index) {
            final fileCol = fileColumns[index];
            final mappedCrmField = state.columnMapping[fileCol];

            return Padding(
              padding: const EdgeInsets.only(bottom: 12.0),
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: Text(
                      fileCol,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.0),
                    child: Icon(Icons.arrow_forward_outlined, color: Colors.grey),
                  ),
                  Expanded(
                    flex: 3,
                    child: DropdownButtonFormField<String>(
                      initialValue: crmFields.containsKey(mappedCrmField) ? mappedCrmField : null,
                      elevation: 1,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      hint: const Text('Ignore this column'),
                      items: [
                        const DropdownMenuItem<String>(
                          value: '',
                          child: Text('-- Ignore --', style: TextStyle(color: Colors.grey)),
                        ),
                        ...crmFields.entries.map((e) => DropdownMenuItem(
                          value: e.key,
                          child: Text(e.value),
                        )),
                      ],
                      onChanged: (val) {
                        notifier.updateMapping(fileCol, val ?? '');
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: () => notifier.goBackToTypes(),
              child: const Text('Back'),
            ),
            ElevatedButton(
              onPressed: () => notifier.goToPreview(),
              child: const Text('Continue to Preview'),
            ),
          ],
        )
      ],
    );
  }

  Map<String, String> _getCrmFields(String type) {
    switch (type) {
      case 'contacts':
        return {
          'firstName': 'First Name',
          'lastName': 'Last Name',
          'email': 'Email',
          'phone': 'Phone',
          'company': 'Company',
          'jobTitle': 'Job Title',
          'address': 'Address',
          'city': 'City',
          'country': 'Country',
        };
      case 'leads':
        return {
          'title': 'Lead Title',
          'budget': 'Budget',
          'tripType': 'Trip Type',
          'source': 'Lead Source',
          'destination': 'Destination',
          'contactName': 'Contact Name',
          'contactEmail': 'Contact Email',
          'contactPhone': 'Contact Phone',
        };
      case 'suppliers':
        return {
          'name': 'Company Name',
          'type': 'Supplier Type',
          'contactPerson': 'Contact Person',
          'email': 'Email',
          'phone': 'Phone',
        };
      case 'rate_cards':
        return {
          'name': 'Rate Card Name',
          'supplierId': 'Supplier ID/Name',
          'seasonName': 'Season',
          'costPrice': 'Cost Price',
          'sellingPrice': 'Selling Price',
        };
      case 'travellers':
        return {
          'firstName': 'First Name',
          'lastName': 'Last Name',
          'email': 'Email',
          'phone': 'Phone',
          'passportNumber': 'Passport Number',
          'nationality': 'Nationality',
        };
      default:
        return {};
    }
  }
}
