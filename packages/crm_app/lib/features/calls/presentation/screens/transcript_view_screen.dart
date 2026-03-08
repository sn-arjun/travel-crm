import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

// ── Provider ──────────────────────────────────────────────

final _transcriptProvider = FutureProvider.autoDispose
    .family<CallTranscriptModel, String>((ref, callLogId) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getTranscript(callLogId);
});

// ── Screen ────────────────────────────────────────────────

class TranscriptViewScreen extends ConsumerStatefulWidget {
  final String callLogId;
  const TranscriptViewScreen({super.key, required this.callLogId});

  @override
  ConsumerState<TranscriptViewScreen> createState() =>
      _TranscriptViewScreenState();
}

class _TranscriptViewScreenState extends ConsumerState<TranscriptViewScreen> {
  bool _editing = false;
  bool _saving = false;
  late TextEditingController _editCtrl;

  @override
  void initState() {
    super.initState();
    _editCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _editCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveEdit() async {
    if (_editCtrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(voipRepositoryProvider)
          .updateTranscript(widget.callLogId, _editCtrl.text.trim());
      ref.invalidate(_transcriptProvider(widget.callLogId));
      setState(() => _editing = false);
      if (mounted) AppSnackbar.success(context, 'Transcript updated');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to save: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final asyncTranscript = ref.watch(_transcriptProvider(widget.callLogId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Call Transcript'),
        actions: [
          if (!_editing)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit Transcript',
              onPressed: () {
                final data = asyncTranscript.valueOrNull;
                if (data != null) {
                  _editCtrl.text = data.fullTranscript;
                  setState(() => _editing = true);
                }
              },
            ),
          if (!_editing)
            IconButton(
              icon: const Icon(Icons.copy),
              tooltip: 'Copy',
              onPressed: () {
                final data = asyncTranscript.valueOrNull;
                if (data != null) {
                  Clipboard.setData(
                      ClipboardData(text: data.fullTranscript));
                  AppSnackbar.success(context, 'Copied to clipboard');
                }
              },
            ),
        ],
      ),
      body: asyncTranscript.when(
        loading: () => const AppLoading(),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (transcript) => _editing
            ? _buildEditView(transcript)
            : _buildReadView(transcript, theme),
      ),
    );
  }

  Widget _buildReadView(CallTranscriptModel transcript, ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Metadata row
          AppSectionCard(
            title: 'Details',
            child: Column(
              children: [
                _metaRow('Language',
                    transcript.language?.toUpperCase() ?? 'Unknown'),
                _metaRow('Confidence',
                    '${((transcript.confidence ?? 0) * 100).toStringAsFixed(1)}%'),
                _metaRow('Words', '${transcript.wordCount ?? 0}'),
                _metaRow('Duration',
                    _formatDuration(transcript.durationSeconds ?? 0)),
                if (transcript.isEdited)
                  _metaRow('Edited by',
                      transcript.editedByName ?? transcript.editedBy ?? ''),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Speaker segments or full transcript
          if (transcript.speakerSegments != null &&
              transcript.speakerSegments!.isNotEmpty)
            _buildSpeakerView(transcript.speakerSegments!, theme)
          else
            AppSectionCard(
              title: 'Transcript',
              child: SelectableText(
                transcript.fullTranscript,
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.6),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSpeakerView(List<SpeakerSegment> segments, ThemeData theme) {
    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
    ];

    return AppSectionCard(
      title: 'Transcript',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: segments.map((seg) {
          final color = colors[seg.speaker % colors.length];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: color.withValues(alpha: 0.2),
                  child: Text(
                    'S${seg.speaker + 1}',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: color),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Speaker ${seg.speaker + 1}',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                              color: color,
                            ),
                          ),
                          if (seg.start != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              _formatSeconds(seg.start!),
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.outline),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      SelectableText(
                        seg.text,
                        style:
                            theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildEditView(CallTranscriptModel transcript) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Expanded(
            child: TextField(
              controller: _editCtrl,
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'Edit transcript text...',
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed:
                    _saving ? null : () => setState(() => _editing = false),
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _saving ? null : _saveEdit,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.save),
                label: const Text('Save'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _metaRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
              width: 100,
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w500))),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  String _formatDuration(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '${m}m ${s}s';
  }

  String _formatSeconds(double seconds) {
    final m = seconds ~/ 60;
    final s = (seconds % 60).toInt();
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}
