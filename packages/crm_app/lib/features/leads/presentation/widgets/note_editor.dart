import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

import '../../../../app/theme.dart';

/// A rich-text note editor backed by [flutter_quill].
///
/// Accepts / produces a Quill Delta JSON string.
class NoteEditor extends StatefulWidget {
  /// Initial Delta JSON string (or plain text). Pass null for empty.
  final String? initialContent;

  /// Called with the serialised Delta JSON string whenever the content changes.
  final ValueChanged<String>? onChanged;

  /// Whether the editor is in read-only mode.
  final bool readOnly;

  const NoteEditor({
    super.key,
    this.initialContent,
    this.onChanged,
    this.readOnly = false,
  });

  @override
  State<NoteEditor> createState() => _NoteEditorState();
}

class _NoteEditorState extends State<NoteEditor> {
  late final QuillController _controller;

  @override
  void initState() {
    super.initState();
    _controller = QuillController(
      document: _parseDocument(widget.initialContent),
      selection: const TextSelection.collapsed(offset: 0),
      readOnly: widget.readOnly,
    );

    if (!widget.readOnly && widget.onChanged != null) {
      _controller.addListener(_onChanged);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() {
    final json = jsonEncode(_controller.document.toDelta().toJson());
    widget.onChanged?.call(json);
  }

  static Document _parseDocument(String? content) {
    if (content == null || content.isEmpty) return Document();
    try {
      final json = jsonDecode(content);
      if (json is List) {
        return Document.fromJson(json);
      }
    } catch (_) {}
    // Fallback: treat as plain text
    final doc = Document();
    doc.insert(0, content);
    return doc;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.readOnly) {
      return QuillEditor.basic(
        controller: _controller,
      );
    }

    return Column(
      children: [
        QuillSimpleToolbar(
          controller: _controller,
          config: const QuillSimpleToolbarConfig(
            showBoldButton: true,
            showItalicButton: true,
            showUnderLineButton: true,
            showListBullets: true,
            showListNumbers: true,
            showLink: true,
            showColorButton: false,
            showBackgroundColorButton: false,
            showClearFormat: true,
            showHeaderStyle: false,
            showStrikeThrough: false,
            showCodeBlock: false,
            showQuote: false,
            showIndent: false,
            showAlignmentButtons: false,
            showDividers: false,
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: QuillEditor.basic(
            controller: _controller,
            config: const QuillEditorConfig(
              placeholder: 'Write your note here…',
              padding: EdgeInsets.all(AppTheme.spacingMd),
            ),
          ),
        ),
      ],
    );
  }
}
