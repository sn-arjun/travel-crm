import 'package:flutter/material.dart';
import 'package:shared/shared.dart';
import 'package:intl/intl.dart';

class DocumentListItem extends StatelessWidget {
  final DocumentModel document;
  final VoidCallback? onDelete;

  const DocumentListItem({
    super.key,
    required this.document,
    this.onDelete,
  });

  IconData _getFileIcon(String? mimeType) {
    if (mimeType == null) return Icons.insert_drive_file;
    if (mimeType.startsWith('image/')) return Icons.image;
    if (mimeType == 'application/pdf') return Icons.picture_as_pdf;
    if (mimeType.contains('spreadsheet') || mimeType == 'text/csv') return Icons.table_chart;
    if (mimeType.contains('wordprocessing')) return Icons.description;
    return Icons.insert_drive_file;
  }

  Color _getFileColor(String? mimeType) {
    if (mimeType == null) return Colors.grey;
    if (mimeType.startsWith('image/')) return Colors.blue;
    if (mimeType == 'application/pdf') return Colors.red;
    if (mimeType.contains('spreadsheet') || mimeType == 'text/csv') return Colors.green;
    if (mimeType.contains('wordprocessing')) return Colors.indigo;
    return Colors.grey;
  }

  String _formatSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _getFileColor(document.mimeType).withValues(alpha: 0.1),
          child: Icon(
            _getFileIcon(document.mimeType),
            color: _getFileColor(document.mimeType),
            size: 20,
          ),
        ),
        title: Text(
          document.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
        ),
        subtitle: Text(
          [
            _formatSize(document.fileSize),
            if (document.category != null && document.category != 'other') document.category,
            if (document.createdAt != null)
              DateFormat.yMMMd().format(DateTime.parse(document.createdAt!)),
          ].join(' · '),
          style: theme.textTheme.bodySmall,
        ),
        trailing: PopupMenuButton<String>(
          itemBuilder: (ctx) => [
            const PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
          onSelected: (value) {
            if (value == 'delete' && onDelete != null) {
              onDelete!();
            }
          },
        ),
      ),
    );
  }
}
