import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/forms/app_text_field.dart';
import '../../data/contact_provider.dart';

class ContactShareDialog extends ConsumerStatefulWidget {
  final String contactId;
  final String contactName;

  const ContactShareDialog({
    super.key,
    required this.contactId,
    required this.contactName,
  });

  static Future<void> show(BuildContext context, {
    required String contactId,
    required String contactName,
  }) {
    return showDialog(
      context: context,
      builder: (_) => ContactShareDialog(
        contactId: contactId,
        contactName: contactName,
      ),
    );
  }

  @override
  ConsumerState<ContactShareDialog> createState() => _ContactShareDialogState();
}

class _ContactShareDialogState extends ConsumerState<ContactShareDialog> {
  final _userIdCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  bool _sharing = false;

  @override
  void dispose() {
    _userIdCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _share() async {
    if (_userIdCtrl.text.trim().isEmpty) return;

    setState(() => _sharing = true);
    try {
      await ref.read(contactRepositoryProvider).shareContact(
            widget.contactId,
            sharedWith: _userIdCtrl.text.trim(),
            note: _noteCtrl.text.trim().isNotEmpty ? _noteCtrl.text.trim() : null,
          );
      if (mounted) {
        Navigator.of(context).pop();
        AppSnackbar.success(context, 'Contact shared successfully');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(
          context,
          e is ApiException ? e.message : 'Failed to share contact',
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Share "${widget.contactName}"'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppTextField(
              controller: _userIdCtrl,
              label: 'User ID',
              hint: 'Enter the user ID to share with',
              prefixIcon: Icons.person_search_outlined,
            ),
            const SizedBox(height: AppTheme.spacingMd),
            AppTextField(
              controller: _noteCtrl,
              label: 'Note (optional)',
              hint: 'Add a note for the recipient',
              maxLines: 2,
              prefixIcon: Icons.note_outlined,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _sharing ? null : _share,
          child: _sharing
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Share'),
        ),
      ],
    );
  }
}
