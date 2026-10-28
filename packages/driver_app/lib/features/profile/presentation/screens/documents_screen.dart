import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../trips/data/trip_view.dart';
import '../../data/profile_provider.dart';

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  final ImagePicker _picker = ImagePicker();

  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    await ref.read(profileProvider.notifier).loadDocuments();
    if (mounted) setState(() => _loading = false);
  }

  Widget _buildBody(ProfileState state, AppLocalizations l10n) {
    if (_loading && state.documents.isEmpty) {
      return ListView(
        key: const Key('documents-loading'),
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: const [
          TripCardSkeleton(),
          SizedBox(height: 12),
          TripCardSkeleton(),
        ],
      );
    }

    if (state.documents.isEmpty) {
      final failed = state.error != null;
      return RefreshIndicator(
        onRefresh: _load,
        child: failed
            ? StateMessage(
                key: const Key('documents-error'),
                icon: Icons.cloud_off_outlined,
                isError: true,
                title: l10n.documentsLoadError,
                actionLabel: l10n.retry,
                onAction: _load,
              )
            : StateMessage(
                key: const Key('documents-empty'),
                icon: Icons.description_outlined,
                title: l10n.noDocuments,
                message: l10n.noDocumentsHint,
              ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        itemCount: state.documents.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) =>
            _DocumentCard(doc: state.documents[index], l10n: l10n),
      ),
    );
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
      body: _buildBody(state, l10n),
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
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.uploadDocument,
                style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 8),
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
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Add a photo of the document',
                style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 8),
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
        return (doc['type'] ?? '').toString();
    }
  }

  IconData get _typeIcon {
    switch (doc['type']) {
      case 'license':
        return Icons.badge_outlined;
      case 'id_proof':
        return Icons.credit_card;
      case 'police_verification':
        return Icons.verified_user_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final semantic = AppSemantic.of(context);
    final text = Theme.of(context).textTheme;
    final expiry = DocumentExpiry.of(doc['expiryDate']?.toString());

    final SemanticTone? tone;
    final String statusLabel;
    final IconData statusIcon;
    switch (expiry.state) {
      case DocumentExpiryState.expired:
        tone = semantic.danger;
        statusLabel = l10n.docExpired;
        statusIcon = Icons.error_outline;
      case DocumentExpiryState.expiringSoon:
        tone = semantic.warning;
        statusLabel = l10n.docExpiringSoon;
        statusIcon = Icons.schedule;
      case DocumentExpiryState.valid:
        tone = semantic.success;
        statusLabel = l10n.docValid;
        statusIcon = Icons.check_circle_outline;
      case DocumentExpiryState.none:
        tone = null;
        statusLabel = l10n.docNoExpiry;
        statusIcon = Icons.all_inclusive;
    }

    final chipBg = tone?.container ?? scheme.surfaceContainerHighest;
    final chipFg = tone?.onContainer ?? scheme.onSurfaceVariant;
    final chipAccent = tone?.color ?? scheme.onSurfaceVariant;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: scheme.primaryContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(_typeIcon, color: scheme.onPrimaryContainer),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_typeLabel, style: text.titleMedium),
                  if (expiry.date != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      l10n.expiresOn(expiry.formatted),
                      style: text.bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              key: Key('document-status-${doc['type']}'),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: chipBg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: chipAccent.withValues(alpha: 0.35)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(statusIcon, size: 14, color: chipAccent),
                  const SizedBox(width: 4),
                  Text(
                    statusLabel,
                    style: TextStyle(
                      color: chipFg,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum DocumentExpiryState { none, valid, expiringSoon, expired }

/// Expiry classification of a document: expired, due within 30 days, valid,
/// or no expiry date.
class DocumentExpiry {
  final DocumentExpiryState state;
  final DateTime? date;

  const DocumentExpiry(this.state, this.date);

  static DocumentExpiry of(String? iso, {DateTime? now}) {
    final dt = iso == null ? null : DateTime.tryParse(iso);
    if (dt == null) return const DocumentExpiry(DocumentExpiryState.none, null);
    final today = now ?? DateTime.now();
    final daysLeft = DateTime(dt.year, dt.month, dt.day)
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
    if (daysLeft < 0) return DocumentExpiry(DocumentExpiryState.expired, dt);
    if (daysLeft < 30) {
      return DocumentExpiry(DocumentExpiryState.expiringSoon, dt);
    }
    return DocumentExpiry(DocumentExpiryState.valid, dt);
  }

  /// "3 Oct 2026".
  String get formatted => date == null ? '' : TripView.formatDate(date!);
}
