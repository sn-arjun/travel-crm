import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/import_wizard_provider.dart';

class Step3Preview extends ConsumerWidget {
  const Step3Preview({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importWizardProvider);
    final notifier = ref.read(importWizardProvider.notifier);

    if (state.currentJob == null) {
      return const Text('No job found.');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Import Preview',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 16),
        
        Card(
          elevation: 0,
          color: Colors.blue.shade50,
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSummaryRow('Entity Type:', state.selectedType.toUpperCase()),
                const SizedBox(height: 8),
                _buildSummaryRow('File Name:', state.currentJob?.fileName ?? ''),
                const SizedBox(height: 8),
                _buildSummaryRow('Total Rows:', '${state.currentJob?.totalRows ?? 0}'),
                const SizedBox(height: 8),
                _buildSummaryRow('Mapped Columns:', '${state.columnMapping.values.where((v) => v.isNotEmpty).length} mapped'),
              ],
            ),
          ),
        ),
        
        const SizedBox(height: 24),
        const Text(
          'Duplicate Strategy',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 8),
        const Text('How should we handle records that already exist in the CRM?'),
        const SizedBox(height: 8),
        
        RadioGroup<String>(
          groupValue: state.duplicateStrategy,
          onChanged: (val) => notifier.setDuplicateStrategy(val!),
          child: Column(children: [
            RadioListTile<String>(
              title: const Text('Skip'),
              subtitle: const Text('Do not import rows that match existing records.'),
              value: 'skip',
            ),
            RadioListTile<String>(
              title: const Text('Merge (Update)'),
              subtitle: const Text('Update existing records with new data from the file.'),
              value: 'merge',
            ),
            RadioListTile<String>(
              title: const Text('Create New'),
              subtitle: const Text('Always create new records, even if they appear to be duplicates.'),
              value: 'create',
            ),
          ]),
        ),

        if (state.executionError != null) ...[
          const SizedBox(height: 16),
          Text(state.executionError!, style: const TextStyle(color: Colors.red)),
        ],

        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton(
              onPressed: state.isExecuting ? null : () => notifier.goBackToMapping(),
              child: const Text('Back'),
            ),
            ElevatedButton(
              onPressed: state.isExecuting ? null : () => notifier.executeImport(),
              child: state.isExecuting 
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Start Import'),
            ),
          ],
        )
      ],
    );
  }

  Widget _buildSummaryRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}
