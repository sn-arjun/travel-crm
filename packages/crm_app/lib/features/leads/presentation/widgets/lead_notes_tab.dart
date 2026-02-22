import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../features/auth/data/auth_provider.dart';
import '../../data/lead_provider.dart';
import 'note_card.dart';
import 'quick_note_dialog.dart';

/// Notes tab for the lead detail screen.
///
/// Displays a list of [NoteCard]s. The FAB opens [QuickNoteDialog].
class LeadNotesTab extends ConsumerStatefulWidget {
  final String leadId;

  const LeadNotesTab({super.key, required this.leadId});

  @override
  ConsumerState<LeadNotesTab> createState() => _LeadNotesTabState();
}

class _LeadNotesTabState extends ConsumerState<LeadNotesTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(leadDetailProvider(widget.leadId).notifier).loadNotes();
    });
  }

  Future<void> _addNote() async {
    final content = await QuickNoteDialog.show(context);
    if (content == null || content.isEmpty) return;
    if (!mounted) return;
    await ref
        .read(leadDetailProvider(widget.leadId).notifier)
        .addNote(content);
    if (!mounted) return;
    AppSnackbar.success(context, 'Note saved');
  }

  Future<void> _deleteNote(String noteId) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note?',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    if (!mounted) return;
    await ref
        .read(leadDetailProvider(widget.leadId).notifier)
        .deleteNote(noteId);
    if (!mounted) return;
    AppSnackbar.success(context, 'Note deleted');
  }

  Future<void> _editNote(LeadActivity note) async {
    final ctx = context;
    final updated = await QuickNoteDialog.show(
      ctx,
      initialContent: note.content,
    );
    if (updated == null || !mounted) return;
    await ref
        .read(leadDetailProvider(widget.leadId).notifier)
        .updateNote(note.id, updated);
    if (!mounted) return;
    AppSnackbar.success(context, 'Note updated');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(leadDetailProvider(widget.leadId));
    final currentUserId = ref.watch(authProvider).user?.id;

    if (state.notesLoading && state.notes.isEmpty) {
      return const Center(child: AppLoading());
    }

    return Stack(
      children: [
        if (state.notes.isEmpty)
          const Center(child: Text('No notes yet. Tap + to add a note.'))
        else
          ListView.builder(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              80, // room for FAB
            ),
            itemCount: state.notes.length,
            itemBuilder: (context, i) {
              final note = state.notes[i];
              final isAuthor = note.createdBy == currentUserId;
              return NoteCard(
                note: note,
                canModify: isAuthor,
                onDelete: () => _deleteNote(note.id),
                onEdit: () => _editNote(note),
              );
            },
          ),
        // FAB
        Positioned(
          right: AppTheme.spacingMd,
          bottom: AppTheme.spacingMd,
          child: FloatingActionButton(
            heroTag: 'note_fab',
            mini: true,
            onPressed: _addNote,
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }
}
