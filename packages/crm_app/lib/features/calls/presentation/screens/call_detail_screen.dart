import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

// ── Provider ──────────────────────────────────────────────

final _callDetailProvider = FutureProvider.autoDispose
    .family<CallLogModel, String>((ref, id) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getCall(id);
});

// ── Screen ────────────────────────────────────────────────

class CallDetailScreen extends ConsumerStatefulWidget {
  final String callId;
  const CallDetailScreen({super.key, required this.callId});

  @override
  ConsumerState<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends ConsumerState<CallDetailScreen> {
  bool _saving = false;
  String? _selectedOutcome;
  late TextEditingController _notesCtrl;
  bool _outcomeInit = false;

  @override
  void initState() {
    super.initState();
    _notesCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveOutcomeNotes() async {
    setState(() => _saving = true);
    try {
      final data = <String, dynamic>{};
      if (_selectedOutcome != null) data['outcome'] = _selectedOutcome;
      if (_notesCtrl.text.isNotEmpty) data['notes'] = _notesCtrl.text;
      if (data.isEmpty) return;

      await ref.read(voipRepositoryProvider).updateCall(widget.callId, data);
      ref.invalidate(_callDetailProvider(widget.callId));
      if (mounted) {
        AppSnackbar.success(context, 'Call log updated');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final callAsync = ref.watch(_callDetailProvider(widget.callId));
    final theme = Theme.of(context);

    return callAsync.when(
      loading: () => const AppLoading(),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (call) {
        // Initialize from loaded data
        if (!_outcomeInit) {
          _outcomeInit = true;
          _selectedOutcome = call.outcome;
          if (call.notes != null) {
            _notesCtrl.text = call.notes!;
          }
        }

        final isInbound = call.direction == 'inbound';

        return SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  IconButton(
                    onPressed: () => context.go('/calls'),
                    icon: const Icon(Icons.arrow_back),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      call.contactName ??
                          (isInbound ? call.fromNumber : call.toNumber),
                      style: theme.textTheme.headlineSmall,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── Call Info ──────────────────────────────
              AppSectionCard(
                title: 'Call Information',
                child: Column(
                  children: [
                    _InfoRow(
                        label: 'Direction',
                        value: call.direction.toUpperCase(),
                        icon: isInbound
                            ? Icons.phone_callback
                            : Icons.phone_forwarded),
                    _InfoRow(label: 'Status', value: call.status),
                    _InfoRow(label: 'From', value: call.fromNumber),
                    _InfoRow(label: 'To', value: call.toNumber),
                    _InfoRow(
                        label: 'Duration',
                        value: _formatDuration(call.durationSeconds)),
                    if (call.createdByName != null)
                      _InfoRow(
                          label: 'Created By',
                          value: call.createdByName!),
                    _InfoRow(label: 'Date', value: call.createdAt ?? ''),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ── Linked Entities ────────────────────────
              if (call.contactName != null || call.leadTitle != null) ...[
                AppSectionCard(
                  title: 'Linked Entities',
                  child: Column(
                    children: [
                      if (call.contactName != null)
                        ListTile(
                          leading: const Icon(Icons.person_outlined),
                          title: Text(call.contactName!),
                          subtitle: const Text('Contact'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: call.contactId != null
                              ? () => context
                                  .go('/contacts/${call.contactId}')
                              : null,
                        ),
                      if (call.leadTitle != null)
                        ListTile(
                          leading: const Icon(Icons.leaderboard_outlined),
                          title: Text(call.leadTitle!),
                          subtitle: const Text('Lead'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: call.leadId != null
                              ? () =>
                                  context.go('/leads/${call.leadId}')
                              : null,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // ── Recording ──────────────────────────────
              if (call.recordingUrl != null) ...[
                AppSectionCard(
                  title: 'Recording',
                  child: ListTile(
                    leading: const Icon(Icons.play_circle_outlined),
                    title: const Text('Call Recording'),
                    subtitle: Text(call.recordingDuration != null
                        ? _formatDuration(call.recordingDuration!)
                        : 'Available'),
                    trailing: const Icon(Icons.download_outlined),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // ── Outcome & Notes ────────────────────────
              AppSectionCard(
                title: 'Outcome & Notes',
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _selectedOutcome,
                      decoration: const InputDecoration(
                        labelText: 'Call Outcome',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                            value: 'interested',
                            child: Text('Interested')),
                        DropdownMenuItem(
                            value: 'not_interested',
                            child: Text('Not Interested')),
                        DropdownMenuItem(
                            value: 'follow_up_needed',
                            child: Text('Follow-Up Needed')),
                        DropdownMenuItem(
                            value: 'wrong_number',
                            child: Text('Wrong Number')),
                        DropdownMenuItem(
                            value: 'no_answer',
                            child: Text('No Answer')),
                        DropdownMenuItem(
                            value: 'voicemail',
                            child: Text('Voicemail')),
                      ],
                      onChanged: (v) =>
                          setState(() => _selectedOutcome = v),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _notesCtrl,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Add call notes...',
                        border: OutlineInputBorder(),
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _saveOutcomeNotes,
                        icon: _saving
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2))
                            : const Icon(Icons.save_outlined),
                        label: const Text('Save'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        );
      },
    );
  }

  String _formatDuration(int seconds) {
    if (seconds == 0) return '0:00';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;

  const _InfoRow({required this.label, required this.value, this.icon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
          ],
          SizedBox(
            width: 100,
            child: Text(label,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
          Expanded(
            child: Text(value, style: theme.textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}
