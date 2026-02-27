import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../auth/data/auth_provider.dart';

// ── Provider ──────────────────────────────────────────────

final _loginHistoryProvider =
    FutureProvider.autoDispose<List<LoginHistoryModel>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.profileLoginHistory);
  final list = response.data['data'] as List;
  return list.map((e) => LoginHistoryModel.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────

class LoginHistoryScreen extends ConsumerWidget {
  const LoginHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_loginHistoryProvider);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Login History', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
          const SizedBox(height: 8),
          Text('View your recent login activity', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: AppTheme.spacingLg),
          Expanded(
            child: async.when(
              loading: () => const AppLoading(message: 'Loading login history...'),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (entries) => entries.isEmpty
                  ? _EmptyState()
                  : ListView.separated(
                      itemCount: entries.length,
                      separatorBuilder: (_, _) => const SizedBox(height: AppTheme.spacingSm),
                      itemBuilder: (context, i) => _LoginEntryCard(entry: entries[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Login Entry Card ──────────────────────────────────────

class _LoginEntryCard extends StatelessWidget {
  final LoginHistoryModel entry;
  const _LoginEntryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSuccess = entry.status == 'success';
    final isFailed = entry.status == 'failed';

    final (Color statusBg, Color statusFg, String statusLabel) = isSuccess
        ? (const Color(0xFFF0FDF4), const Color(0xFF16A34A), 'Success')
        : isFailed
            ? (const Color(0xFFFEF2F2), const Color(0xFFDC2626), 'Failed')
            : (const Color(0xFFFFF7ED), const Color(0xFFEA580C), 'Locked');

    final icon = _browserIcon(entry.browser);
    final location = [entry.city, entry.country].where((s) => s != null && s.isNotEmpty).join(', ');

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              ),
              child: Icon(icon, size: 22, color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(width: AppTheme.spacingMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    [entry.browser, entry.os].where((s) => s != null && s.isNotEmpty).join(' on '),
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.language_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(
                            entry.ipAddress?.isNotEmpty == true ? entry.ipAddress! : 'Local',
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                      if (entry.device != null && entry.device!.isNotEmpty)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.devices_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                            const SizedBox(width: 4),
                            Text(entry.device!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                          ],
                        ),
                      if (location.isNotEmpty)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.location_on_outlined, size: 14, color: theme.colorScheme.onSurfaceVariant),
                            const SizedBox(width: 4),
                            Text(location, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                          ],
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: statusBg, borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                  child: Text(statusLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusFg)),
                ),
                const SizedBox(height: 4),
                Text(
                  _formatDate(entry.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData _browserIcon(String? browser) {
    if (browser == null) return Icons.public_rounded;
    final b = browser.toLowerCase();
    if (b.contains('chrome')) return Icons.public_rounded;
    if (b.contains('firefox')) return Icons.local_fire_department_rounded;
    if (b.contains('safari')) return Icons.travel_explore_rounded;
    if (b.contains('edge')) return Icons.public_rounded;
    return Icons.public_rounded;
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
      return '${dt.day}/${dt.month}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
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
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(AppTheme.radiusXl),
            ),
            child: const Icon(Icons.history_rounded, size: 40, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text('No login history yet', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Your login attempts will appear here', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
