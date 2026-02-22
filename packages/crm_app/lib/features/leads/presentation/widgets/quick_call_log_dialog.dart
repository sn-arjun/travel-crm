import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/lead_provider.dart';

/// A bottom-sheet dialog for logging a call on a lead.
///
/// Lets the user pick a call duration, outcome, and optional notes.
/// On save it posts a `lead_activity` of type 'call'.
class QuickCallLogDialog extends ConsumerStatefulWidget {
  final String leadId;

  const QuickCallLogDialog({super.key, required this.leadId});

  /// Shows the dialog.
  static Future<void> show(BuildContext context, String leadId) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => QuickCallLogDialog(leadId: leadId),
    );
  }

  @override
  ConsumerState<QuickCallLogDialog> createState() => _QuickCallLogDialogState();
}

class _QuickCallLogDialogState extends ConsumerState<QuickCallLogDialog> {
  static const _durations = [1, 5, 10, 15, 30, 60];
  static const _outcomes = [
    ('connected', 'Connected'),
    ('no_answer', 'No Answer'),
    ('busy', 'Busy'),
    ('voicemail', 'Voicemail'),
  ];

  int _duration = 5;
  String _outcome = 'connected';
  final _notesCtrl = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final repo = ref.read(leadRepositoryProvider);
      await repo.logActivity(
        widget.leadId,
        type: 'call',
        content: 'Call · ${_duration}min · $_outcome'
            '${_notesCtrl.text.trim().isNotEmpty ? '\n${_notesCtrl.text.trim()}' : ''}',
        metadata: {
          'duration_min': _duration,
          'outcome': _outcome,
        },
      );
      // Refresh activities
      await ref
          .read(leadDetailProvider(widget.leadId).notifier)
          .loadActivities();

      if (!mounted) return;
      Navigator.pop(context);
      AppSnackbar.success(context, 'Call logged');
    } catch (_) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to log call');
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
                Text('Log Call', style: theme.textTheme.titleMedium),
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
                // Duration segmented buttons
                Text('Duration', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingXs),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SegmentedButton<int>(
                    segments: _durations
                        .map((d) => ButtonSegment(
                              value: d,
                              label: Text('${d}m'),
                            ))
                        .toList(),
                    selected: {_duration},
                    onSelectionChanged: (s) =>
                        setState(() => _duration = s.first),
                    style: SegmentedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacingMd),

                // Outcome dropdown
                DropdownButtonFormField<String>(
                  initialValue: _outcome,
                  decoration: const InputDecoration(
                    labelText: 'Outcome',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: _outcomes
                      .map((o) =>
                          DropdownMenuItem(value: o.$1, child: Text(o.$2)))
                      .toList(),
                  onChanged: (v) => setState(() => _outcome = v ?? _outcome),
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
                  maxLines: 3,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
