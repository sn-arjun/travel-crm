import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/followup_provider.dart';

/// A bottom-sheet for scheduling a follow-up on a lead.
///
/// Lets the user pick date, time, type (call/email/whatsapp/visit), and notes.
class ScheduleFollowUpDialog extends ConsumerStatefulWidget {
  final String leadId;

  const ScheduleFollowUpDialog({super.key, required this.leadId});

  static Future<void> show(BuildContext context, String leadId) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ScheduleFollowUpDialog(leadId: leadId),
    );
  }

  @override
  ConsumerState<ScheduleFollowUpDialog> createState() =>
      _ScheduleFollowUpDialogState();
}

class _ScheduleFollowUpDialogState
    extends ConsumerState<ScheduleFollowUpDialog> {
  static const _types = [
    (value: 'call', icon: Icons.phone_outlined, label: 'Call'),
    (value: 'email', icon: Icons.email_outlined, label: 'Email'),
    (value: 'whatsapp', icon: Icons.message_outlined, label: 'WhatsApp'),
    (value: 'visit', icon: Icons.place_outlined, label: 'Visit'),
    (value: 'sms', icon: Icons.sms_outlined, label: 'SMS'),
  ];

  DateTime? _date;
  TimeOfDay? _time;
  String _type = 'call';
  final _notesCtrl = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time ?? TimeOfDay.now(),
    );
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _save() async {
    if (_date == null || _time == null) {
      AppSnackbar.error(context, 'Please select a date and time');
      return;
    }

    final scheduledAt = DateTime(
      _date!.year,
      _date!.month,
      _date!.day,
      _time!.hour,
      _time!.minute,
    );

    setState(() => _saving = true);
    try {
      final repo = ref.read(followUpRepositoryProvider);
      await repo.scheduleFollowUp(
        leadId: widget.leadId,
        scheduledAt: scheduledAt.toIso8601String(),
        type: _type,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      );
      // Refresh the global follow-ups list
      ref.read(myFollowUpsProvider.notifier).loadAll();

      if (!mounted) return;
      Navigator.pop(context);
      AppSnackbar.success(context, 'Follow-up scheduled');
    } catch (_) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to schedule follow-up');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final viewInsets = MediaQuery.viewInsetsOf(context);

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
            child: Row(
              children: [
                Text('Schedule Follow-up', style: theme.textTheme.titleMedium),
                const Spacer(),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
              ],
            ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Date + Time row
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today, size: 16),
                        label: Text(
                          _date == null
                              ? 'Pick Date'
                              : '${_date!.day}/${_date!.month}/${_date!.year}',
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacingSm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickTime,
                        icon: const Icon(Icons.access_time, size: 16),
                        label: Text(
                          _time == null
                              ? 'Pick Time'
                              : _time!.format(context),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppTheme.spacingMd),

                // Type row
                Text('Type', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingXs),
                Wrap(
                  spacing: AppTheme.spacingXs,
                  children: _types
                      .map(
                        (t) => ChoiceChip(
                          avatar: Icon(t.icon, size: 14),
                          label: Text(t.label),
                          selected: _type == t.value,
                          onSelected: (_) =>
                              setState(() => _type = t.value),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: AppTheme.spacingMd),

                // Notes
                TextField(
                  controller: _notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Notes (optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  maxLines: 2,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
