import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../providers/import_history_provider.dart';

class ImportHistoryScreen extends ConsumerWidget {
  const ImportHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Import History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New Import',
            onPressed: () => context.go('/settings/import'),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => ref.read(importHistoryProvider.notifier).loadHistory(),
          ),
        ],
      ),
      body: state.when(
        data: (jobs) {
          if (jobs.isEmpty) {
            return const Center(child: Text('No import history found.'));
          }
          return ListView.builder(
            itemCount: jobs.length,
            padding: const EdgeInsets.all(16),
            itemBuilder: (context, index) {
              final job = jobs[index];
              final date = job.createdAt != null 
                  ? DateFormat('MMM d, y HH:mm').format(DateTime.parse(job.createdAt!).toLocal()) 
                  : 'Unknown Date';
                  
              return Card(
                elevation: 0,
                color: Colors.grey.shade50,
                shape: RoundedRectangleBorder(
                  side: BorderSide(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(8),
                ),
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  title: Text('${job.importType.toUpperCase()} - ${job.fileName}'),
                  subtitle: Text('$date • ${job.processedRows}/${job.totalRows} rows processed'),
                  trailing: _buildStatusBadge(job.status),
                  onTap: () {
                    // Show a dialog with more details if needed
                  },
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Error loading history: $error')),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'completed':
        color = Colors.green;
        break;
      case 'failed':
        color = Colors.red;
        break;
      case 'processing':
        color = Colors.blue;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
