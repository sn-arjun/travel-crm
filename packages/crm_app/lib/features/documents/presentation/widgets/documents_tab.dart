import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared/shared.dart';

import '../../../auth/data/auth_provider.dart';
import '../../data/document_repository.dart';
import 'document_list_item.dart';

class DocumentsTab extends ConsumerStatefulWidget {
  final String entityType;
  final String entityId;

  const DocumentsTab({
    super.key,
    required this.entityType,
    required this.entityId,
  });

  @override
  ConsumerState<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends ConsumerState<DocumentsTab> {
  List<DocumentModel> _documents = [];
  bool _loading = true;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  Future<void> _loadDocuments() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = DocumentRepository(apiClient: apiClient);
      final result = await repo.getDocuments(
        entityType: widget.entityType,
        entityId: widget.entityId,
      );
      final items = (result['data'] as List?)
              ?.map((e) => DocumentModel.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];
      setState(() {
        _documents = items;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _uploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'csv'],
    );

    if (result == null || result.files.isEmpty) return;

    setState(() => _uploading = true);

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = DocumentRepository(apiClient: apiClient);

      for (final file in result.files) {
        if (file.bytes == null) continue;

        await repo.uploadDocument(
          fileName: file.name,
          fileBytes: file.bytes!,
          mimeType: _getMimeType(file.extension ?? ''),
          entityType: widget.entityType,
          entityId: widget.entityId,
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${result.files.length} file(s) uploaded')),
        );
      }
      await _loadDocuments();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  String _getMimeType(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'csv':
        return 'text/csv';
      default:
        return 'application/octet-stream';
    }
  }

  Future<void> _deleteDocument(DocumentModel doc) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Document'),
        content: Text('Delete "${doc.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = DocumentRepository(apiClient: apiClient);
      await repo.deleteDocument(doc.id);
      await _loadDocuments();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Delete failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Error: $_error'),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _loadDocuments,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Text(
                '${_documents.length} document(s)',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: _uploading ? null : _uploadFile,
                icon: _uploading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.upload_file, size: 18),
                label: Text(_uploading ? 'Uploading...' : 'Upload'),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: _documents.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.folder_open, size: 48, color: Colors.grey[400]),
                      const SizedBox(height: 8),
                      const Text('No documents yet'),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _uploadFile,
                        icon: const Icon(Icons.upload_file, size: 16),
                        label: const Text('Upload a file'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadDocuments,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _documents.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final doc = _documents[index];
                      return DocumentListItem(
                        document: doc,
                        onDelete: () => _deleteDocument(doc),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}
