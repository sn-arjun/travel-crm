import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/import_wizard_provider.dart';

class Step1Upload extends ConsumerWidget {
  const Step1Upload({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importWizardProvider);
    final notifier = ref.read(importWizardProvider.notifier);

    const importTypes = {
      'contacts': 'Contacts',
      'leads': 'Leads',
      'suppliers': 'Suppliers',
      'rate_cards': 'Rate Cards',
      'travellers': 'Travellers',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Select Import Type',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: state.selectedType,
          items: importTypes.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (val) {
            if (val != null) notifier.setType(val);
          },
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            icon: const Icon(Icons.download),
            label: const Text('Download Template'),
            onPressed: () async {
              final url = Uri.parse(notifier.getTemplateUrl());
              if (await canLaunchUrl(url)) {
                await launchUrl(url);
              }
            },
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Upload File (CSV or Excel)',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: () async {
            final result = await FilePicker.platform.pickFiles(
              type: FileType.custom,
              allowedExtensions: ['csv', 'xlsx', 'xls'],
            );
            if (result != null && result.files.single.path != null) {
              notifier.selectFile(File(result.files.single.path!));
            }
          },
          child: Container(
            height: 120,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade400, style: BorderStyle.solid),
              borderRadius: BorderRadius.circular(8),
              color: Colors.grey.shade50,
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_upload_outlined, size: 40, color: Colors.blue),
                  const SizedBox(height: 8),
                  Text(
                    state.selectedFile != null
                        ? state.selectedFile!.path.split(Platform.pathSeparator).last
                        : 'Click to select file',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (state.uploadError != null) ...[
          const SizedBox(height: 16),
          Text(state.uploadError!, style: const TextStyle(color: Colors.red)),
        ],
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: state.selectedFile == null || state.isUploading
              ? null
              : () => notifier.uploadFile(),
          child: state.isUploading
              ? const SizedBox(
                  height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Upload & Continue'),
        ),
      ],
    );
  }
}
