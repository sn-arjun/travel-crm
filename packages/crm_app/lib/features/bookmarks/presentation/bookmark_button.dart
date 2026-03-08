import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/auth_provider.dart';
import '../data/bookmark_repository.dart';

class BookmarkButton extends ConsumerStatefulWidget {
  final String entityType;
  final String entityId;

  const BookmarkButton({
    super.key,
    required this.entityType,
    required this.entityId,
  });

  @override
  ConsumerState<BookmarkButton> createState() => _BookmarkButtonState();
}

class _BookmarkButtonState extends ConsumerState<BookmarkButton> {
  bool _bookmarked = false;
  String? _bookmarkId;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _checkBookmark();
  }

  Future<void> _checkBookmark() async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = BookmarkRepository(apiClient: apiClient);
      final result = await repo.checkBookmark(widget.entityType, widget.entityId);
      if (mounted) {
        setState(() {
          _bookmarked = result.bookmarked;
          _bookmarkId = result.bookmarkId;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleBookmark() async {
    final apiClient = ref.read(apiClientProvider);
    final repo = BookmarkRepository(apiClient: apiClient);

    try {
      if (_bookmarked && _bookmarkId != null) {
        await repo.removeBookmark(_bookmarkId!);
        if (mounted) {
          setState(() {
            _bookmarked = false;
            _bookmarkId = null;
          });
        }
      } else {
        final bm = await repo.addBookmark(widget.entityType, widget.entityId);
        if (mounted) {
          setState(() {
            _bookmarked = true;
            _bookmarkId = bm.id;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Bookmark failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        width: 24,
        height: 24,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    return IconButton(
      icon: Icon(
        _bookmarked ? Icons.star : Icons.star_border,
        color: _bookmarked ? Colors.amber : null,
      ),
      tooltip: _bookmarked ? 'Remove bookmark' : 'Bookmark',
      onPressed: _toggleBookmark,
    );
  }
}
