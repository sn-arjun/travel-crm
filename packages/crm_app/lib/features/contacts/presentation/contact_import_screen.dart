import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/feedback/app_snackbar.dart';
import '../data/contact_provider.dart';

class ContactImportScreen extends ConsumerStatefulWidget {
  const ContactImportScreen({super.key});

  @override
  ConsumerState<ContactImportScreen> createState() => _ContactImportScreenState();
}

class _ContactImportScreenState extends ConsumerState<ContactImportScreen> {
  int _step = 0; // 0=upload, 1=preview, 2=importing, 3=results
  String? _filePath;
  String? _fileName;
  ImportResult? _result;
  String? _error;

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv'],
    );
    if (result != null && result.files.single.path != null) {
      setState(() {
        _filePath = result.files.single.path;
        _fileName = result.files.single.name;
        _step = 1;
      });
    }
  }

  Future<void> _import() async {
    if (_filePath == null) return;
    setState(() {
      _step = 2;
      _error = null;
    });

    try {
      final result = await ref.read(contactRepositoryProvider).importContacts(_filePath!);
      setState(() {
        _result = result;
        _step = 3;
      });
      ref.read(contactListProvider.notifier).loadContacts(refresh: true);
    } catch (e) {
      setState(() {
        _error = e is ApiException ? e.message : 'Import failed';
        _step = 1;
      });
      if (mounted) AppSnackbar.error(context, _error!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Import Contacts'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/contacts'),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              children: [
                // Stepper indicator
                Row(
                  children: [
                    _StepDot(label: 'Upload', active: _step >= 0, done: _step > 0),
                    const Expanded(child: Divider()),
                    _StepDot(label: 'Preview', active: _step >= 1, done: _step > 1),
                    const Expanded(child: Divider()),
                    _StepDot(label: 'Import', active: _step >= 2, done: _step > 2),
                    const Expanded(child: Divider()),
                    _StepDot(label: 'Results', active: _step >= 3, done: false),
                  ],
                ),
                const SizedBox(height: AppTheme.spacingXl),
                Expanded(child: _buildStep(theme)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(ThemeData theme) {
    return switch (_step) {
      0 => _buildUploadStep(theme),
      1 => _buildPreviewStep(theme),
      2 => _buildImportingStep(theme),
      3 => _buildResultsStep(theme),
      _ => const SizedBox.shrink(),
    };
  }

  Widget _buildUploadStep(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.cloud_upload_outlined, size: 64,
            color: theme.colorScheme.primary.withValues(alpha: 0.5)),
        const SizedBox(height: AppTheme.spacingMd),
        Text('Upload CSV File', style: theme.textTheme.titleLarge),
        const SizedBox(height: AppTheme.spacingSm),
        Text(
          'File must have a "name" column. Optional: email, phone, company, type, city, country, tags, source.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppTheme.spacingLg),
        FilledButton.icon(
          onPressed: _pickFile,
          icon: const Icon(Icons.file_open_outlined),
          label: const Text('Choose CSV File'),
        ),
      ],
    );
  }

  Widget _buildPreviewStep(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.description_outlined, size: 48, color: theme.colorScheme.primary),
        const SizedBox(height: AppTheme.spacingMd),
        Text(_fileName ?? 'contacts.csv', style: theme.textTheme.titleMedium),
        const SizedBox(height: AppTheme.spacingLg),
        if (_error != null) ...[
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          const SizedBox(height: AppTheme.spacingMd),
        ],
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            OutlinedButton(
              onPressed: () => setState(() { _step = 0; _filePath = null; _fileName = null; }),
              child: const Text('Choose Different File'),
            ),
            const SizedBox(width: AppTheme.spacingMd),
            FilledButton(onPressed: _import, child: const Text('Start Import')),
          ],
        ),
      ],
    );
  }

  Widget _buildImportingStep(ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const CircularProgressIndicator(),
        const SizedBox(height: AppTheme.spacingLg),
        Text('Importing contacts...', style: theme.textTheme.titleMedium),
      ],
    );
  }

  Widget _buildResultsStep(ThemeData theme) {
    final r = _result!;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.check_circle_outline, size: 64, color: AppTheme.successColor),
        const SizedBox(height: AppTheme.spacingMd),
        Text('Import Complete', style: theme.textTheme.titleLarge),
        const SizedBox(height: AppTheme.spacingLg),
        _ResultRow(label: 'Total rows', value: '${r.total}'),
        _ResultRow(label: 'Imported', value: '${r.imported}'),
        _ResultRow(label: 'Skipped', value: '${r.skipped}'),
        if (r.errors.isNotEmpty) ...[
          const SizedBox(height: AppTheme.spacingMd),
          Text('Errors:', style: theme.textTheme.titleSmall),
          const SizedBox(height: AppTheme.spacingSm),
          ...r.errors.take(5).map((e) => Text(
              'Row ${e.row}: ${e.message}',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
          )),
          if (r.errors.length > 5)
            Text('...and ${r.errors.length - 5} more errors', style: theme.textTheme.bodySmall),
        ],
        const SizedBox(height: AppTheme.spacingXl),
        FilledButton(
          onPressed: () => context.go('/contacts'),
          child: const Text('Go to Contacts'),
        ),
      ],
    );
  }
}

class _StepDot extends StatelessWidget {
  final String label;
  final bool active;
  final bool done;
  const _StepDot({required this.label, required this.active, required this.done});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = active ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.3);
    return Column(
      children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? color : Colors.transparent,
            border: Border.all(color: color, width: 2),
          ),
          child: done ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
        ),
        const SizedBox(height: 4),
        Text(label, style: theme.textTheme.labelSmall?.copyWith(color: color)),
      ],
    );
  }
}

class _ResultRow extends StatelessWidget {
  final String label;
  final String value;
  const _ResultRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(width: 120, child: Text(label, textAlign: TextAlign.right)),
          const SizedBox(width: AppTheme.spacingMd),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
