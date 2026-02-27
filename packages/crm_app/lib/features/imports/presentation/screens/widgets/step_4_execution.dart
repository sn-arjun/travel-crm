import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/import_wizard_provider.dart';

class Step4Execution extends ConsumerWidget {
  const Step4Execution({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importWizardProvider);
    final notifier = ref.read(importWizardProvider.notifier);

    if (state.currentJob == null) {
      return const Text('No active import job.');
    }

    final job = state.currentJob!;
    final progress = job.totalRows > 0 ? job.processedRows / job.totalRows : 0.0;
    
    final isDone = job.status == 'completed' || job.status == 'failed';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Import Progress',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 16),
        
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Status: ${job.status.toUpperCase()}', 
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: job.status == 'failed' ? Colors.red : job.status == 'completed' ? Colors.green : Colors.blue,
              ),
            ),
            if (state.isPolling)
              const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          ],
        ),
        
        const SizedBox(height: 16),
        LinearProgressIndicator(
          value: progress,
          minHeight: 10,
          borderRadius: BorderRadius.circular(5),
          backgroundColor: Colors.grey.shade200,
        ),
        const SizedBox(height: 8),
        Text('${job.processedRows} / ${job.totalRows} rows processed', textAlign: TextAlign.right),
        
        const SizedBox(height: 24),
        
        Row(
          children: [
            Expanded(child: _buildStatCard('Successfully Imported', job.successCount, Colors.green)),
            const SizedBox(width: 8),
            Expanded(child: _buildStatCard('Duplicates Found', job.duplicateCount, Colors.orange)),
            const SizedBox(width: 8),
            Expanded(child: _buildStatCard('Errors', job.errorCount, Colors.red)),
          ],
        ),

        const SizedBox(height: 24),

        if (state.importErrors.isNotEmpty) ...[
          const Text(
            'Import Errors',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.red),
          ),
          const SizedBox(height: 8),
          Container(
            height: 200,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.red.shade200),
              borderRadius: BorderRadius.circular(8),
              color: Colors.red.shade50,
            ),
            child: ListView.separated(
              itemCount: state.importErrors.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final errorRow = state.importErrors[index];
                return ListTile(
                  title: Text('Row ${errorRow.rowNumber}'),
                  subtitle: Text(errorRow.errors),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              icon: const Icon(Icons.download),
              label: const Text('Download Errors (Excel)'),
              onPressed: () async {
                final url = Uri.parse(notifier.getErrorDownloadUrl());
                if (await canLaunchUrl(url)) {
                  await launchUrl(url);
                }
              },
            ),
          )
        ],

        if (isDone) ...[
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () {
              // Close wizard or start a new import
              Navigator.of(context).pop();
            },
            child: const Text('Done'),
          ),
        ]
      ],
    );
  }

  Widget _buildStatCard(String title, int value, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(8),
        color: color.withValues(alpha: 0.05),
      ),
      child: Column(
        children: [
          Text(title, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: color)),
          const SizedBox(height: 4),
          Text('$value', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }
}
