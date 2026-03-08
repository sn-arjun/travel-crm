import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../data/voip_repository.dart';

// ── Screen ────────────────────────────────────────────────

class TranscriptSearchScreen extends ConsumerStatefulWidget {
  const TranscriptSearchScreen({super.key});

  @override
  ConsumerState<TranscriptSearchScreen> createState() =>
      _TranscriptSearchScreenState();
}

class _TranscriptSearchScreenState
    extends ConsumerState<TranscriptSearchScreen> {
  final _searchCtrl = TextEditingController();
  bool _loading = false;
  List<TranscriptSearchResult> _results = [];
  int _total = 0;
  int _page = 1;
  bool _hasMore = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search({bool loadMore = false}) async {
    final query = _searchCtrl.text.trim();
    if (query.isEmpty) return;

    if (!loadMore) _page = 1;

    setState(() => _loading = true);
    try {
      final result = await ref
          .read(voipRepositoryProvider)
          .searchTranscripts(query: query, page: _page);
      setState(() {
        if (loadMore) {
          _results.addAll(result.data);
        } else {
          _results = result.data;
        }
        _total = result.pagination?.total ?? 0;
        _hasMore = result.pagination?.hasMore ?? false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Search failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Search Transcripts')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search call transcripts...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() {
                            _results = [];
                            _total = 0;
                          });
                        },
                      )
                    : null,
                border: const OutlineInputBorder(),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _search(),
              onChanged: (_) => setState(() {}),
            ),
          ),
          if (_total > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '$_total result${_total == 1 ? '' : 's'} found',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
              ),
            ),
          if (_loading && _results.isEmpty)
            const Expanded(child: AppLoading())
          else if (_results.isEmpty)
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.record_voice_over_outlined,
                        size: 64, color: theme.colorScheme.outline),
                    const SizedBox(height: 16),
                    Text('Search across all call transcripts',
                        style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                itemCount: _results.length + (_hasMore ? 1 : 0),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemBuilder: (ctx, i) {
                  if (i == _results.length) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: _loading
                            ? const CircularProgressIndicator()
                            : TextButton(
                                onPressed: () {
                                  _page++;
                                  _search(loadMore: true);
                                },
                                child: const Text('Load more'),
                              ),
                      ),
                    );
                  }
                  return _ResultCard(
                    result: _results[i],
                    onTap: () => context
                        .push('/calls/transcript/${_results[i].callLogId}'),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final TranscriptSearchResult result;
  final VoidCallback onTap;

  const _ResultCard({required this.result, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dirIcon = result.direction == 'inbound'
        ? Icons.call_received
        : Icons.call_made;
    final dirColor =
        result.direction == 'inbound' ? Colors.blue : Colors.green;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(dirIcon, size: 16, color: dirColor),
                  const SizedBox(width: 6),
                  Text(
                    result.contactName ?? result.fromNumber ?? 'Unknown',
                    style: theme.textTheme.titleSmall,
                  ),
                  const Spacer(),
                  if (result.durationSeconds != null)
                    Text(
                      '${(result.durationSeconds! ~/ 60)}:${(result.durationSeconds! % 60).toString().padLeft(2, '0')}',
                      style: theme.textTheme.bodySmall,
                    ),
                ],
              ),
              if (result.snippet != null) ...[
                const SizedBox(height: 8),
                Text(
                  _stripHtml(result.snippet!),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(height: 1.4),
                ),
              ],
              const SizedBox(height: 6),
              Row(
                children: [
                  if (result.language != null) ...[
                    Chip(
                      label: Text(result.language!.toUpperCase(),
                          style: const TextStyle(fontSize: 10)),
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    ),
                    const SizedBox(width: 6),
                  ],
                  if (result.confidence != null)
                    Text(
                      '${(result.confidence! * 100).toStringAsFixed(0)}% confidence',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  const Spacer(),
                  if (result.createdAt != null)
                    Text(
                      _formatDate(result.createdAt!),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _stripHtml(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), '');
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}
