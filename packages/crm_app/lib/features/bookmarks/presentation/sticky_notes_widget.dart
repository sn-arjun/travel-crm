import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';
import '../data/bookmark_repository.dart';

class StickyNotesWidget extends ConsumerStatefulWidget {
  const StickyNotesWidget({super.key});

  @override
  ConsumerState<StickyNotesWidget> createState() => _StickyNotesWidgetState();
}

class _StickyNotesWidgetState extends ConsumerState<StickyNotesWidget> {
  List<StickyNoteModel> _notes = [];
  bool _loading = true;

  static const _noteColors = {
    'yellow': Color(0xFFFFF9C4),
    'blue': Color(0xFFBBDEFB),
    'green': Color(0xFFC8E6C9),
    'pink': Color(0xFFF8BBD0),
    'purple': Color(0xFFE1BEE7),
  };

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  Future<void> _loadNotes() async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = StickyNoteRepository(apiClient: apiClient);
      final notes = await repo.getNotes();
      if (mounted) setState(() { _notes = notes; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addNote() async {
    final result = await showDialog<({String content, String color})>(
      context: context,
      builder: (ctx) => _NoteDialog(),
    );
    if (result == null) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = StickyNoteRepository(apiClient: apiClient);
      await repo.createNote(result.content, result.color);
      await _loadNotes();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create note: $e')),
        );
      }
    }
  }

  Future<void> _editNote(StickyNoteModel note) async {
    final result = await showDialog<({String content, String color})>(
      context: context,
      builder: (ctx) => _NoteDialog(
        initialContent: note.content,
        initialColor: note.color,
      ),
    );
    if (result == null) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = StickyNoteRepository(apiClient: apiClient);
      await repo.updateNote(note.id, content: result.content, color: result.color);
      await _loadNotes();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update note: $e')),
        );
      }
    }
  }

  Future<void> _deleteNote(StickyNoteModel note) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Note'),
        content: const Text('Are you sure you want to delete this note?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = StickyNoteRepository(apiClient: apiClient);
      await repo.deleteNote(note.id);
      await _loadNotes();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete note: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.sticky_note_2, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text('Sticky Notes', style: theme.textTheme.titleSmall),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.add, size: 20),
                  onPressed: _notes.length >= 20 ? null : _addNote,
                  tooltip: 'Add note',
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_notes.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('No sticky notes yet', style: theme.textTheme.bodySmall),
                ),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _notes.map((note) {
                  final bgColor = _noteColors[note.color] ?? _noteColors['yellow']!;
                  return GestureDetector(
                    onTap: () => _editNote(note),
                    onLongPress: () => _deleteNote(note),
                    child: Container(
                      width: 140,
                      constraints: const BoxConstraints(minHeight: 80),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: bgColor,
                        borderRadius: BorderRadius.circular(8),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (note.isPinned == 1)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 4),
                              child: Icon(Icons.push_pin, size: 12, color: Colors.grey),
                            ),
                          Text(
                            note.content,
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: Colors.black87,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }
}

class _NoteDialog extends StatefulWidget {
  final String? initialContent;
  final String? initialColor;

  const _NoteDialog({this.initialContent, this.initialColor});

  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  late final TextEditingController _controller;
  late String _selectedColor;

  static const _colors = ['yellow', 'blue', 'green', 'pink', 'purple'];
  static const _colorValues = {
    'yellow': Color(0xFFFFF9C4),
    'blue': Color(0xFFBBDEFB),
    'green': Color(0xFFC8E6C9),
    'pink': Color(0xFFF8BBD0),
    'purple': Color(0xFFE1BEE7),
  };

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialContent ?? '');
    _selectedColor = widget.initialColor ?? 'yellow';
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.initialContent != null ? 'Edit Note' : 'New Note'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _controller,
            maxLines: 4,
            maxLength: 500,
            decoration: const InputDecoration(
              hintText: 'Write your note...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: _colors.map((color) {
              return GestureDetector(
                onTap: () => setState(() => _selectedColor = color),
                child: Container(
                  width: 32,
                  height: 32,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: _colorValues[color],
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _selectedColor == color ? Colors.black54 : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_controller.text.trim().isEmpty) return;
            Navigator.pop(context, (content: _controller.text.trim(), color: _selectedColor));
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
