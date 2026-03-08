import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/ai_intelligence_repository.dart';

class DocumentOcrScreen extends ConsumerStatefulWidget {
  const DocumentOcrScreen({super.key});

  @override
  ConsumerState<DocumentOcrScreen> createState() => _DocumentOcrScreenState();
}

class _DocumentOcrScreenState extends ConsumerState<DocumentOcrScreen> {
  String _docType = 'passport';
  bool _loading = false;
  Map<String, dynamic>? _result;

  Future<void> _pickAndScan() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty || result.files.first.bytes == null) return;

    setState(() => _loading = true);
    try {
      final base64Image = base64Encode(result.files.first.bytes!);
      final repo = ref.read(aiIntelligenceRepositoryProvider);

      Map<String, dynamic> scanResult;
      switch (_docType) {
        case 'passport':
          scanResult = await repo.scanPassport(base64Image);
        case 'supplier_invoice':
          scanResult = await repo.scanSupplierInvoice(base64Image);
        default:
          scanResult = await repo.scanPassport(base64Image);
      }

      setState(() => _result = scanResult);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'OCR failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Document OCR')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Document Type', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  avatar: const Icon(Icons.badge, size: 16),
                  label: const Text('Passport'),
                  selected: _docType == 'passport',
                  onSelected: (_) => setState(() => _docType = 'passport'),
                ),
                ChoiceChip(
                  avatar: const Icon(Icons.receipt, size: 16),
                  label: const Text('Supplier Invoice'),
                  selected: _docType == 'supplier_invoice',
                  onSelected: (_) => setState(() => _docType = 'supplier_invoice'),
                ),
                ChoiceChip(
                  avatar: const Icon(Icons.folder, size: 16),
                  label: const Text('Visa Documents'),
                  selected: _docType == 'visa_document',
                  onSelected: (_) => setState(() => _docType = 'visa_document'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              height: 120,
              child: InkWell(
                onTap: _loading ? null : _pickAndScan,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: theme.colorScheme.outlineVariant, width: 2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: _loading
                      ? const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 8),
                              Text('Scanning...'),
                            ],
                          ),
                        )
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.camera_alt_outlined, size: 36, color: theme.colorScheme.primary),
                            const SizedBox(height: 8),
                            Text('Tap to scan document', style: theme.textTheme.bodyMedium),
                          ],
                        ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            if (_result != null) ...[
              AppSectionCard(
                title: 'Extracted Data',
                child: Column(
                  children: (_result!['extracted'] as Map<String, dynamic>? ?? _result!)
                      .entries
                      .where((e) => e.key != 'rawText' && e.value != null)
                      .map((e) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(
                                  width: 140,
                                  child: Text(
                                    _camelToTitle(e.key),
                                    style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                                  ),
                                ),
                                Expanded(
                                  child: e.value is List
                                      ? Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: (e.value as List).map<Widget>((item) => Text(
                                                item is Map ? item.toString() : '$item',
                                                style: const TextStyle(fontSize: 13),
                                              )).toList(),
                                        )
                                      : Text('${e.value}', style: const TextStyle(fontSize: 13)),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ),
              const SizedBox(height: 12),

              if (_result!['cost'] != null)
                Text(
                  'Cost: \$${(_result!['cost'] as num).toStringAsFixed(5)}',
                  style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline),
                ),
              const SizedBox(height: 16),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _result = null),
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: () {
                        AppSnackbar.success(context, 'Data applied');
                      },
                      icon: const Icon(Icons.check),
                      label: const Text('Apply Data'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _camelToTitle(String s) {
    return s
        .replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(0)}')
        .trim()
        .split(' ')
        .map((w) => w.isNotEmpty ? w[0].toUpperCase() + w.substring(1) : '')
        .join(' ');
  }
}
