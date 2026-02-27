import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/profile_provider.dart';

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
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
        onPressed: () => _showUploadSheet(context, l10n),
        icon: const Icon(Icons.upload_file),
        label: Text(l10n.uploadDocument),
      ),
    );
  }

  void _showUploadSheet(BuildContext context, AppLocalizations l10n) {
    showModalBottomSheet(
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
            ListTile(
              leading: const Icon(Icons.badge),
              title: Text(l10n.license),
              onTap: () {
                Navigator.pop(ctx);
                // TODO: implement document upload
              },
            ),
            ListTile(
              leading: const Icon(Icons.credit_card),
              title: Text(l10n.idProof),
              onTap: () {
                Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: const Icon(Icons.verified_user),
              title: Text(l10n.policeVerification),
              onTap: () {
                Navigator.pop(ctx);
              },
            ),
            const SizedBox(height: 16),
          ],
        ),
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
