import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../auth/data/auth_provider.dart';
import '../data/bookmark_repository.dart';

class BookmarksScreen extends ConsumerStatefulWidget {
  const BookmarksScreen({super.key});

  @override
  ConsumerState<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends ConsumerState<BookmarksScreen> {
  List<BookmarkModel> _bookmarks = [];
  bool _loading = true;
  String? _filterType;

  static const _entityTypes = ['lead', 'contact', 'itinerary', 'invoice'];

  @override
  void initState() {
    super.initState();
    _loadBookmarks();
  }

  Future<void> _loadBookmarks() async {
    setState(() => _loading = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = BookmarkRepository(apiClient: apiClient);
      final bookmarks = await repo.getBookmarks(entityType: _filterType);
      if (mounted) setState(() { _bookmarks = bookmarks; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _removeBookmark(BookmarkModel bm) async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final repo = BookmarkRepository(apiClient: apiClient);
      await repo.removeBookmark(bm.id);
      await _loadBookmarks();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to remove: $e')),
        );
      }
    }
  }

  void _navigateToEntity(BookmarkModel bm) {
    switch (bm.entityType) {
      case 'lead':
        context.go('/leads/${bm.entityId}');
      case 'contact':
        context.go('/contacts/${bm.entityId}');
      case 'itinerary':
        context.go('/itineraries/${bm.entityId}');
      case 'invoice':
        context.go('/invoices/${bm.entityId}');
    }
  }

  IconData _getEntityIcon(String type) {
    switch (type) {
      case 'lead': return Icons.trending_up;
      case 'contact': return Icons.person;
      case 'itinerary': return Icons.map;
      case 'invoice': return Icons.receipt;
      default: return Icons.bookmark;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bookmarks'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/dashboard'),
        ),
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: _filterType == null,
                  onSelected: (_) {
                    setState(() => _filterType = null);
                    _loadBookmarks();
                  },
                ),
                const SizedBox(width: 8),
                ..._entityTypes.map((type) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(type[0].toUpperCase() + type.substring(1)),
                    selected: _filterType == type,
                    onSelected: (_) {
                      setState(() => _filterType = _filterType == type ? null : type);
                      _loadBookmarks();
                    },
                  ),
                )),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _bookmarks.isEmpty
                    ? const Center(child: Text('No bookmarks'))
                    : RefreshIndicator(
                        onRefresh: _loadBookmarks,
                        child: ListView.builder(
                          itemCount: _bookmarks.length,
                          itemBuilder: (context, index) {
                            final bm = _bookmarks[index];
                            return ListTile(
                              leading: Icon(_getEntityIcon(bm.entityType)),
                              title: Text(bm.entityName ?? 'Unknown'),
                              subtitle: Text(bm.entityType[0].toUpperCase() + bm.entityType.substring(1)),
                              trailing: IconButton(
                                icon: const Icon(Icons.star, color: Colors.amber),
                                onPressed: () => _removeBookmark(bm),
                              ),
                              onTap: () => _navigateToEntity(bm),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
