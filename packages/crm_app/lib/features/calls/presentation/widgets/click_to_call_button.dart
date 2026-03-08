import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/voip_repository.dart';

/// Reusable click-to-call button with two variants: primary (filled) and icon-only.
///
/// Usage:
///   ClickToCallButton(phoneNumber: '+1234567890', contactId: 'abc')
///   ClickToCallButton.icon(phoneNumber: '+1234567890')
class ClickToCallButton extends ConsumerStatefulWidget {
  final String phoneNumber;
  final String? contactId;
  final String? leadId;
  final String? contactName;
  final bool iconOnly;

  const ClickToCallButton({
    super.key,
    required this.phoneNumber,
    this.contactId,
    this.leadId,
    this.contactName,
    this.iconOnly = false,
  });

  const ClickToCallButton.icon({
    super.key,
    required this.phoneNumber,
    this.contactId,
    this.leadId,
    this.contactName,
  }) : iconOnly = true;

  @override
  ConsumerState<ClickToCallButton> createState() => _ClickToCallButtonState();
}

class _ClickToCallButtonState extends ConsumerState<ClickToCallButton> {
  bool _calling = false;

  Future<void> _initiateCall() async {
    if (_calling) return;

    // Confirm before calling
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Make Call'),
        content: Text(
          'Call ${widget.contactName ?? widget.phoneNumber}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.phone),
            label: const Text('Call'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _calling = true);
    try {
      final result = await ref.read(voipRepositoryProvider).initiateCall(
            toNumber: widget.phoneNumber,
            contactId: widget.contactId,
            leadId: widget.leadId,
          );
      if (mounted) {
        AppSnackbar.success(context, 'Call initiated');
        context.go('/calls/${result.callLogId}');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _calling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.iconOnly) {
      return IconButton(
        onPressed: _calling ? null : _initiateCall,
        icon: _calling
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.phone),
        tooltip: 'Call ${widget.contactName ?? widget.phoneNumber}',
        color: Theme.of(context).colorScheme.primary,
      );
    }

    return FilledButton.tonalIcon(
      onPressed: _calling ? null : _initiateCall,
      icon: _calling
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.phone),
      label: Text(_calling ? 'Calling...' : 'Call'),
    );
  }
}
