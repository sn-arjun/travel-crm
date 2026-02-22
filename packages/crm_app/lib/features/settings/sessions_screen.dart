import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../auth/data/auth_provider.dart';

// ── Provider ──────────────────────────────────────────────

final _sessionsProvider =
    FutureProvider.autoDispose<List<SessionModel>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.sessions);
  final list = response.data['data'] as List;
  return list.map((e) => SessionModel.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────

class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_sessionsProvider);
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
                    Text('Active Sessions', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    Text('Manage your active login sessions', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => _revokeAll(context, ref),
                icon: const Icon(Icons.logout_rounded, size: 16),
                label: const Text('Revoke All Others'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.3)),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingLg),
          Expanded(
            child: async.when(
              loading: () => const AppLoading(message: 'Loading sessions...'),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (sessions) => sessions.isEmpty
                  ? _EmptyState()
                  : ListView.separated(
                      itemCount: sessions.length,
                      separatorBuilder: (_, _) => const SizedBox(height: AppTheme.spacingSm),
                      itemBuilder: (context, i) => _SessionCard(
                        session: sessions[i],
                        onRevoke: sessions[i].isCurrent ? null : () => _revokeSession(context, ref, sessions[i].id),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _revokeSession(BuildContext context, WidgetRef ref, String sessionId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke this session?'),
        content: const Text('This device will be signed out immediately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.delete(ApiEndpoints.revokeSession(sessionId));
      ref.invalidate(_sessionsProvider);
      if (context.mounted) AppSnackbar.success(context, 'Session revoked');
    } catch (e) {
      if (context.mounted) AppSnackbar.error(context, 'Failed to revoke session');
    }
  }

  Future<void> _revokeAll(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke all other sessions?'),
        content: const Text('All other devices will be signed out immediately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revoke All'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.delete(ApiEndpoints.revokeAllSessions);
      ref.invalidate(_sessionsProvider);
      if (context.mounted) AppSnackbar.success(context, 'All other sessions revoked');
    } catch (e) {
      if (context.mounted) AppSnackbar.error(context, 'Failed to revoke sessions');
    }
  }
}

// ── Session Card ──────────────────────────────────────────

class _SessionCard extends StatelessWidget {
  final SessionModel session;
  final VoidCallback? onRevoke;
  const _SessionCard({required this.session, this.onRevoke});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final location = [session.city, session.country].where((s) => s != null && s.isNotEmpty).join(', ');

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: session.isCurrent ? const Color(0xFFEEF2FF) : theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              ),
              child: Icon(
                _deviceIcon(session.device, session.os),
                size: 22,
                color: session.isCurrent ? AppTheme.primaryColor : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: AppTheme.spacingMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          '${session.browser} on ${session.os}',
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (session.isCurrent) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEEF2FF),
                            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
                          ),
                          child: const Text('Current', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (session.ipAddress != null) ...[
                        Icon(Icons.language_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(session.ipAddress!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        const SizedBox(width: 12),
                      ],
                      if (location.isNotEmpty) ...[
                        Icon(Icons.location_on_outlined, size: 14, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(location, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(_formatDate(session.loginAt), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                if (onRevoke != null) ...[
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: onRevoke,
                    style: TextButton.styleFrom(
                      foregroundColor: theme.colorScheme.error,
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Revoke', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData _deviceIcon(String device, String os) {
    final d = device.toLowerCase();
    final o = os.toLowerCase();
    if (d.contains('mobile') || d.contains('phone')) return Icons.phone_android_rounded;
    if (d.contains('tablet')) return Icons.tablet_rounded;
    if (o.contains('windows')) return Icons.desktop_windows_rounded;
    if (o.contains('mac')) return Icons.laptop_mac_rounded;
    return Icons.devices_rounded;
  }

  String _formatDate(String iso) {
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
            child: const Icon(Icons.devices_rounded, size: 40, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text('No active sessions', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Your active sessions will appear here', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
