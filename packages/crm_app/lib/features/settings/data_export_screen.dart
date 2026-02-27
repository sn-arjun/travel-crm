import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../exports/data/export_provider.dart';

class DataExportScreen extends ConsumerStatefulWidget {
  const DataExportScreen({super.key});

  @override
  ConsumerState<DataExportScreen> createState() => _DataExportScreenState();
}

class _DataExportScreenState extends ConsumerState<DataExportScreen> {
  bool _isExporting = false;
  String? _exportJobId;
  ExportJobModel? _exportJob;
  Timer? _pollTimer;
  String? _error;

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _startFullExport() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Export All Data'),
        content: const Text(
          'This will export all your tenant data (contacts, leads, invoices, '
          'payments, suppliers, travellers, users, and settings) into a single '
          'Excel file.\n\nThis may take a few minutes for large datasets.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Start Export'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _isExporting = true;
      _error = null;
      _exportJob = null;
    });

    try {
      final job = await ref.read(exportProvider).startGdprExport();
      setState(() {
        _exportJobId = job.id;
        _exportJob = job;
      });
      _startPolling();
    } catch (e) {
      setState(() {
        _isExporting = false;
        _error = 'Failed to start export: $e';
      });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (_exportJobId == null) return;
      try {
        final job =
            await ref.read(exportProvider).checkExportJob(_exportJobId!);
        if (!mounted) return;
        setState(() => _exportJob = job);

        if (job.status == 'completed' || job.status == 'failed') {
          _pollTimer?.cancel();
          setState(() => _isExporting = false);
        }
      } catch (_) {
        // Keep polling on transient errors
      }
    });
  }

  Future<void> _downloadExport() async {
    if (_exportJobId == null) return;
    await ref.read(exportProvider).downloadExportJob(_exportJobId!);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Data Privacy & Export')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Info card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.shield_outlined,
                        color: theme.colorScheme.primary, size: 32),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Full Data Export',
                              style: theme.textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          Text(
                            'Export all your organization\'s data for compliance, '
                            'backup, or migration purposes. The export includes '
                            'contacts, leads, invoices, payments, suppliers, '
                            'travellers, users, and settings.',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Included data section
            Text('Included in Export',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            _DataTypeRow(icon: Icons.people_outline, label: 'Contacts'),
            _DataTypeRow(icon: Icons.leaderboard_outlined, label: 'Leads'),
            _DataTypeRow(icon: Icons.receipt_long_outlined, label: 'Invoices'),
            _DataTypeRow(icon: Icons.payments_outlined, label: 'Payments'),
            _DataTypeRow(icon: Icons.business_outlined, label: 'Suppliers'),
            _DataTypeRow(icon: Icons.flight_outlined, label: 'Travellers'),
            _DataTypeRow(icon: Icons.group_outlined, label: 'Users (no passwords)'),
            _DataTypeRow(icon: Icons.settings_outlined, label: 'Settings & Metadata'),

            const SizedBox(height: 32),

            // Error
            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                child: Text(_error!,
                    style: TextStyle(color: theme.colorScheme.onErrorContainer)),
              ),

            // Export status
            if (_exportJob != null) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _StatusBadge(status: _exportJob!.status),
                          const Spacer(),
                          if (_exportJob!.status == 'completed')
                            FilledButton.icon(
                              onPressed: _downloadExport,
                              icon: const Icon(Icons.download, size: 18),
                              label: const Text('Download'),
                            ),
                        ],
                      ),
                      if (_exportJob!.status == 'processing') ...[
                        const SizedBox(height: 16),
                        const LinearProgressIndicator(),
                        const SizedBox(height: 8),
                        Text('Generating export...',
                            style: theme.textTheme.bodySmall),
                      ],
                      if (_exportJob!.recordCounts != null &&
                          _exportJob!.status == 'completed') ...[
                        const SizedBox(height: 12),
                        Text('Records exported:',
                            style: theme.textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(_exportJob!.recordCounts!,
                            style: theme.textTheme.bodySmall),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Export button
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _isExporting ? null : _startFullExport,
                icon: _isExporting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_download_outlined),
                label: Text(_isExporting
                    ? 'Export in progress...'
                    : 'Export All Data'),
              ),
            ),

            const SizedBox(height: 12),
            Text(
              'Note: Full data export is limited to once every 24 hours. '
              'The download link expires after 24 hours.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DataTypeRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _DataTypeRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: theme.colorScheme.primary),
          const SizedBox(width: 12),
          Text(label, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'pending' => (Colors.grey, 'Pending'),
      'processing' => (Colors.blue, 'Processing'),
      'completed' => (Colors.green, 'Completed'),
      'failed' => (Colors.red, 'Failed'),
      _ => (Colors.grey, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
