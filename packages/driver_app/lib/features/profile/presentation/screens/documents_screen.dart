import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/profile_provider.dart';

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    ref.read(profileProvider.notifier).loadDocuments();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(profileProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.documents),
        bottom: state.isUploading
            ? PreferredSize(
                preferredSize: const Size.fromHeight(4),
                child: LinearProgressIndicator(
                  key: const Key('document-upload-progress'),
                  value: state.uploadProgress,
                ),
              )
            : null,
      ),
      body: state.documents.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.description_outlined,
                      size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text(
                    'No documents uploaded',
                    style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: state.documents.length,
              itemBuilder: (context, index) {
                final doc = state.documents[index];
                return _DocumentCard(doc: doc, l10n: l10n);
              },
            ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('upload-document'),
        onPressed: state.isUploading ? null : () => _showTypeSheet(l10n),
        icon: const Icon(Icons.upload_file),
        label: Text(l10n.uploadDocument),
      ),
    );
  }

  /// Step 1: which document is being uploaded.
  void _showTypeSheet(AppLocalizations l10n) {
    final types = <(String, IconData, String)>[
      ('license', Icons.badge, l10n.license),
      ('id_proof', Icons.credit_card, l10n.idProof),
      ('police_verification', Icons.verified_user, l10n.policeVerification),
    ];

    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 16),
            Text(l10n.uploadDocument,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            for (final (type, icon, label) in types)
              ListTile(
                key: Key('document-type-$type'),
                leading: Icon(icon),
                title: Text(label),
                onTap: () {
                  Navigator.pop(ctx);
                  _showSourceSheet(type);
                },
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  /// Step 2: camera or gallery.
  void _showSourceSheet(String type) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 16),
            const Text('Add a photo of the document',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            ListTile(
              key: const Key('document-source-camera'),
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUpload(type, ImageSource.camera);
              },
            ),
            ListTile(
              key: const Key('document-source-gallery'),
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUpload(type, ImageSource.gallery);
              },
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  /// Step 3: pick the image, ask for an optional expiry date, upload.
  Future<void> _pickAndUpload(String type, ImageSource source) async {
    final messenger = ScaffoldMessenger.of(context);

    XFile? picked;
    try {
      picked = await _picker.pickImage(
        source: source,
        maxWidth: 2000,
        maxHeight: 2000,
        imageQuality: 85,
      );
    } catch (_) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(source == ImageSource.camera
              ? 'Could not open the camera.'
              : 'Could not open the gallery.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    if (picked == null || !mounted) return;

    String? expiry;
    if (type != 'police_verification') {
      final now = DateTime.now();
      final date = await showDatePicker(
        context: context,
        initialDate: now.add(const Duration(days: 365)),
        firstDate: now.subtract(const Duration(days: 365)),
        lastDate: DateTime(now.year + 30),
        helpText: 'Expiry date (optional)',
        cancelText: 'Skip',
      );
      if (!mounted) return;
      if (date != null) {
        expiry = '${date.year.toString().padLeft(4, '0')}-'
            '${date.month.toString().padLeft(2, '0')}-'
            '${date.day.toString().padLeft(2, '0')}';
      }
    }

    final error = await ref.read(profileProvider.notifier).uploadDocument(
          type: type,
          filePath: picked.path,
          fileName: picked.name,
          expiryDate: expiry,
        );
    if (!mounted) return;

    messenger.showSnackBar(
      SnackBar(
        content: Text(error ?? 'Document uploaded'),
        backgroundColor: error == null ? AppColors.success : AppColors.error,
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  final Map<String, dynamic> doc;
  final AppLocalizations l10n;

  const _DocumentCard({required this.doc, required this.l10n});

  String get _typeLabel {
    switch (doc['type']) {
      case 'license':
        return l10n.license;
      case 'id_proof':
        return l10n.idProof;
      case 'police_verification':
        return l10n.policeVerification;
      default:
        return doc['type'] ?? '';
    }
  }

  Color get _expiryColor {
    final expiry = doc['expiryDate'] as String?;
    if (expiry == null) return Colors.grey;
    final dt = DateTime.tryParse(expiry);
    if (dt == null) return Colors.grey;
    final daysLeft = dt.difference(DateTime.now()).inDays;
    if (daysLeft < 0) return AppColors.error;
    if (daysLeft < 30) return AppColors.warning;
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: CircleAvatar(
          backgroundColor: _expiryColor.withValues(alpha: 0.1),
          child: Icon(Icons.description, color: _expiryColor),
        ),
        title: Text(_typeLabel,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: doc['expiryDate'] != null
            ? Text('Expires: ${doc['expiryDate']}')
            : null,
        trailing: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: _expiryColor,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}
