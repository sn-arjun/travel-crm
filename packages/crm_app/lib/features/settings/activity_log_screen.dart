import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../auth/data/auth_provider.dart';

// ── State ─────────────────────────────────────────────────

class _ActivityLogState {
  final List<ActivityLogModel> logs;
  final bool loading;
  final String? error;
  final String? actionFilter;
  final int page;
  final bool hasMore;

  const _ActivityLogState({
    this.logs = const [],
    this.loading = false,
    this.error,
    this.actionFilter,
    this.page = 1,
    this.hasMore = true,
  });

  _ActivityLogState copyWith({
    List<ActivityLogModel>? logs,
    bool? loading,
    String? error,
    String? actionFilter,
    bool clearActionFilter = false,
    int? page,
    bool? hasMore,
  }) => _ActivityLogState(
    logs: logs ?? this.logs,
    loading: loading ?? this.loading,
    error: error,
    actionFilter: clearActionFilter ? null : (actionFilter ?? this.actionFilter),
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
  );
}

// ── Notifier ──────────────────────────────────────────────

class _ActivityLogNotifier extends StateNotifier<_ActivityLogState> {
  final ApiClient _api;

  _ActivityLogNotifier(this._api) : super(const _ActivityLogState());

  Future<void> load({bool refresh = false}) async {
    if (state.loading) return;
    state = state.copyWith(
      loading: true,
      error: null,
      logs: refresh ? [] : state.logs,
      page: refresh ? 1 : state.page,
    );

    try {
      final params = <String, dynamic>{
        'page': refresh ? 1 : state.page,
        'limit': 30,
        if (state.actionFilter != null) 'action': state.actionFilter,
      };

      final response = await _api.get(ApiEndpoints.activityLogs, queryParameters: params);
      final list = (response.data['data'] as List)
          .map((e) => ActivityLogModel.fromJson(e as Map<String, dynamic>))
          .toList();

      final pagination = response.data['pagination'];
      final hasMore = pagination != null ? (pagination['hasMore'] ?? false) as bool : false;

      state = state.copyWith(
        loading: false,
        logs: refresh ? list : [...state.logs, ...list],
        page: (refresh ? 1 : state.page) + 1,
        hasMore: hasMore,
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: e is ApiException ? e.message : 'Failed to load activity logs',
      );
    }
  }

  void setFilter(String? action) {
    state = state.copyWith(actionFilter: action, clearActionFilter: action == null);
    load(refresh: true);
  }
}

final _activityLogProvider =
    StateNotifierProvider.autoDispose<_ActivityLogNotifier, _ActivityLogState>((ref) {
  final api = ref.read(apiClientProvider);
  final notifier = _ActivityLogNotifier(api);
  notifier.load();
  return notifier;
});

// ── Screen ────────────────────────────────────────────────

class ActivityLogScreen extends ConsumerWidget {
  const ActivityLogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(_activityLogProvider);
    final notifier = ref.read(_activityLogProvider.notifier);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Activity Log', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    Text('View all system activity', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              _FilterChips(
                selected: state.actionFilter,
                onChanged: notifier.setFilter,
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingLg),
          Expanded(
            child: state.loading && state.logs.isEmpty
                ? const AppLoading(message: 'Loading activity...')
                : state.error != null && state.logs.isEmpty
                    ? Center(child: Text(state.error!))
                    : state.logs.isEmpty
                        ? _EmptyState()
                        : NotificationListener<ScrollNotification>(
                            onNotification: (scroll) {
                              if (scroll.metrics.pixels > scroll.metrics.maxScrollExtent - 200 &&
                                  state.hasMore && !state.loading) {
                                notifier.load();
                              }
                              return false;
                            },
                            child: ListView.separated(
                              itemCount: state.logs.length + (state.hasMore ? 1 : 0),
                              separatorBuilder: (_, _) => const SizedBox(height: AppTheme.spacingSm),
                              itemBuilder: (context, i) {
                                if (i >= state.logs.length) {
                                  return const Padding(
                                    padding: EdgeInsets.all(AppTheme.spacingMd),
                                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                                  );
                                }
                                return _ActivityCard(log: state.logs[i]);
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

// ── Filter Chips ──────────────────────────────────────────

class _FilterChips extends StatelessWidget {
  final String? selected;
  final ValueChanged<String?> onChanged;
  const _FilterChips({required this.selected, required this.onChanged});

  static const _filters = [
    (null, 'All', Icons.list_rounded),
    ('login', 'Login', Icons.login_rounded),
    ('create', 'Create', Icons.add_circle_outline_rounded),
    ('update', 'Update', Icons.edit_outlined),
    ('delete', 'Delete', Icons.delete_outline_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      children: _filters.map((f) {
        final isSelected = f.$1 == selected;
        return FilterChip(
          selected: isSelected,
          label: Text(f.$2, style: const TextStyle(fontSize: 12)),
          avatar: Icon(f.$3, size: 16),
          onSelected: (_) => onChanged(f.$1),
          showCheckmark: false,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          visualDensity: VisualDensity.compact,
        );
      }).toList(),
    );
  }
}

// ── Activity Card ─────────────────────────────────────────

class _ActivityCard extends StatelessWidget {
  final ActivityLogModel log;
  const _ActivityCard({required this.log});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final (IconData icon, Color iconColor, Color iconBg) = switch (log.action) {
      'login' => (Icons.login_rounded, const Color(0xFF2563EB), const Color(0xFFF0F9FF)),
      'logout' => (Icons.logout_rounded, const Color(0xFF64748B), const Color(0xFFF8FAFC)),
      'create' => (Icons.add_circle_outline_rounded, const Color(0xFF16A34A), const Color(0xFFF0FDF4)),
      'update' => (Icons.edit_outlined, const Color(0xFFF59E0B), const Color(0xFFFFF7ED)),
      'delete' => (Icons.delete_outline_rounded, const Color(0xFFDC2626), const Color(0xFFFEF2F2)),
      'export' => (Icons.download_outlined, const Color(0xFF7C3AED), const Color(0xFFF5F3FF)),
      'import' => (Icons.upload_outlined, const Color(0xFF0D9488), const Color(0xFFF0FDFA)),
      _ => (Icons.info_outline_rounded, const Color(0xFF64748B), const Color(0xFFF8FAFC)),
    };

    final description = _buildDescription();

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: AppTheme.spacingMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(description, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (log.userName != null) ...[
                        Icon(Icons.person_outline_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(log.userName!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        const SizedBox(width: 12),
                      ],
                      if (log.ipAddress != null) ...[
                        Icon(Icons.language_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(log.ipAddress!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                  child: Text(
                    log.action[0].toUpperCase() + log.action.substring(1),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: iconColor),
                  ),
                ),
                const SizedBox(height: 4),
                Text(_formatDate(log.createdAt), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _buildDescription() {
    final action = log.action;
    final entity = log.entityType ?? '';
    switch (action) {
      case 'login':
        return 'Logged in';
      case 'logout':
        return 'Logged out';
      case 'create':
        return 'Created ${entity.isNotEmpty ? entity : 'record'}';
      case 'update':
        return 'Updated ${entity.isNotEmpty ? entity : 'record'}';
      case 'delete':
        return 'Deleted ${entity.isNotEmpty ? entity : 'record'}';
      case 'export':
        return 'Exported ${entity.isNotEmpty ? entity : 'data'}';
      case 'import':
        return 'Imported ${entity.isNotEmpty ? entity : 'data'}';
      default:
        return '$action ${entity.isNotEmpty ? entity : ''}';
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return '-';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Empty State ───────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
            child: const Icon(Icons.timeline_rounded, size: 40, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text('No activity logs yet', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Activity will appear here as users perform actions', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
