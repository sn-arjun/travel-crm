import 'package:flutter/material.dart';
import 'package:shared/shared.dart';
import 'package:url_launcher/url_launcher.dart';

import 'quick_call_log_dialog.dart';
import 'quick_note_dialog.dart';
import 'schedule_followup_dialog.dart';

/// A compact row of quick-action icon buttons for a lead.
///
/// Shown at the bottom of [LeadCard] and inside [LeadDetailScreen].
/// Actions: Note, Call, Follow-up, WhatsApp, Email.
class LeadQuickActions extends StatelessWidget {
  final LeadModel lead;

  /// Called after an action mutates the lead (e.g. note added).
  final VoidCallback? onRefresh;

  const LeadQuickActions({
    super.key,
    required this.lead,
    this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Action(
          icon: Icons.note_add_outlined,
          tooltip: 'Add Note',
          onTap: () => _addNote(context),
        ),
        _Action(
          icon: Icons.phone_outlined,
          tooltip: 'Log Call',
          onTap: () => QuickCallLogDialog.show(context, lead.id),
        ),
        _Action(
          icon: Icons.event_outlined,
          tooltip: 'Schedule Follow-up',
          onTap: () => ScheduleFollowUpDialog.show(context, lead.id),
        ),
        _Action(
          icon: Icons.message_outlined,
          tooltip: 'WhatsApp',
          color: const Color(0xFF25D366),
          onTap: () => _openWhatsApp(context),
        ),
        _Action(
          icon: Icons.email_outlined,
          tooltip: 'Email',
          onTap: () => _openEmail(context),
        ),
      ],
    );
  }

  Future<void> _addNote(BuildContext context) async {
    await QuickNoteDialog.show(context);
    onRefresh?.call();
  }

  Future<void> _openWhatsApp(BuildContext context) async {
    // Phone comes from the contact — use a placeholder if not available
    final phone = ''; // Would need contact model with phone field
    final uri = Uri.parse('https://wa.me/$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('WhatsApp not available')),
      );
    }
  }

  Future<void> _openEmail(BuildContext context) async {
    final uri = Uri.parse('mailto:');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}

class _Action extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final Color? color;

  const _Action({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(icon, size: 18),
      tooltip: tooltip,
      color: color,
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.all(4),
      onPressed: onTap,
    );
  }
}
