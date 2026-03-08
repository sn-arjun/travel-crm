import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/voip_repository.dart';

// ── Provider ──────────────────────────────────────────────

final _callsProvider = FutureProvider.autoDispose
    .family<PaginatedResponse<CallLogModel>, Map<String, dynamic>>(
        (ref, params) async {
  final repo = ref.read(voipRepositoryProvider);
  return repo.getCalls(
    page: params['page'] as int? ?? 1,
    limit: params['limit'] as int? ?? 25,
    direction: params['direction'] as String?,
    status: params['status'] as String?,
    outcome: params['outcome'] as String?,
    search: params['search'] as String?,
  );
});

// ── Screen ────────────────────────────────────────────────

class CallLogScreen extends ConsumerStatefulWidget {
  const CallLogScreen({super.key});

  @override
  ConsumerState<CallLogScreen> createState() => _CallLogScreenState();
}

class _CallLogScreenState extends ConsumerState<CallLogScreen> {
  int _page = 1;
  String? _direction;
  String _search = '';

  Map<String, dynamic> get _params => {
        'page': _page,
        'direction': _direction,
        'search': _search.isEmpty ? null : _search,
      };

  @override
  Widget build(BuildContext context) {
    final callsAsync = ref.watch(_callsProvider(_params));

    return Column(
      children: [
        // ── Toolbar ────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search phone numbers...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    isDense: true,
                  ),
                  onChanged: (v) {
                    setState(() {
                      _search = v;
                      _page = 1;
                    });
                  },
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.tonalIcon(
                onPressed: () => context.go('/calls/dial'),
                icon: const Icon(Icons.dialpad),
                label: const Text('Dial'),
              ),
            ],
          ),
        ),

        // ── Filters ────────────────────────────────
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: AppFilterBar<String>(
            filters: const [
              FilterItem(label: 'Inbound', value: 'inbound'),
              FilterItem(label: 'Outbound', value: 'outbound'),
            ],
            selectedValue: _direction,
            onFilterChanged: (v) => setState(() {
              _direction = v;
              _page = 1;
            }),
          ),
        ),

        // ── Data ──────────────────────────────────
        Expanded(
          child: callsAsync.when(
            loading: () => const AppLoading(),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (result) {
              if (result.data.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.phone_missed_outlined,
                  title: 'No call logs yet',
                  subtitle: 'Make your first call using the dial pad',
                );
              }
              return Column(
                children: [
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      itemCount: result.data.length,
                      itemBuilder: (context, index) {
                        final call = result.data[index];
                        return _CallLogTile(
                          call: call,
                          onTap: () => context.go('/calls/${call.id}'),
                        );
                      },
                    ),
                  ),
                  if (result.pagination != null)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            onPressed: _page > 1
                                ? () => setState(() => _page--)
                                : null,
                            icon: const Icon(Icons.chevron_left),
                          ),
                          Text(
                              'Page $_page of ${result.pagination!.totalPages}'),
                          IconButton(
                            onPressed:
                                result.pagination!.hasMore == true
                                    ? () => setState(() => _page++)
                                    : null,
                            icon: const Icon(Icons.chevron_right),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

// ── Call Log Tile ────────────────────────────────────────

class _CallLogTile extends StatelessWidget {
  final CallLogModel call;
  final VoidCallback? onTap;

  const _CallLogTile({required this.call, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isInbound = call.direction == 'inbound';
    final isMissed =
        call.status == 'no-answer' || call.status == 'canceled';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: isMissed
              ? Colors.red.shade50
              : isInbound
                  ? Colors.blue.shade50
                  : Colors.green.shade50,
          child: Icon(
            isMissed
                ? Icons.phone_missed
                : isInbound
                    ? Icons.phone_callback
                    : Icons.phone_forwarded,
            color: isMissed
                ? Colors.red
                : isInbound
                    ? Colors.blue
                    : Colors.green,
          ),
        ),
        title: Text(
          call.contactName ?? (isInbound ? call.fromNumber : call.toNumber),
          style: theme.textTheme.titleSmall,
        ),
        subtitle: Text(
          [
            call.direction.toUpperCase(),
            _formatDuration(call.durationSeconds),
            if (call.outcome != null) _formatOutcome(call.outcome!),
          ].join(' \u2022 '),
          style: theme.textTheme.bodySmall,
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _StatusChip(status: call.status),
            const SizedBox(height: 4),
            Text(
              _formatTime(call.createdAt),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        onTap: onTap,
      ),
    );
  }

  String _formatDuration(int seconds) {
    if (seconds == 0) return '0:00';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _formatOutcome(String outcome) {
    return outcome.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }

  String _formatTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'completed' => (Colors.green, 'Completed'),
      'in-progress' => (Colors.blue, 'In Call'),
      'ringing' => (Colors.orange, 'Ringing'),
      'initiated' => (Colors.grey, 'Initiated'),
      'failed' => (Colors.red, 'Failed'),
      'no-answer' => (Colors.red.shade300, 'No Answer'),
      'busy' => (Colors.amber, 'Busy'),
      'canceled' => (Colors.grey, 'Canceled'),
      _ => (Colors.grey, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 11, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
