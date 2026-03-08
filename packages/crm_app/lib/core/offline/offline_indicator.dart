import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'connectivity_provider.dart';
import 'offline_cache_manager.dart';

class OfflineIndicator extends ConsumerWidget {
  const OfflineIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(connectivityStatusProvider);
    final cache = ref.watch(offlineCacheManagerProvider);
    final pendingCount = cache.pendingSyncCount;

    if (status == ConnectivityStatus.online && pendingCount == 0) {
      return const SizedBox.shrink();
    }

    final (icon, color, tooltip) = switch (status) {
      ConnectivityStatus.offline => (
          Icons.cloud_off,
          Colors.orange,
          'Offline — changes will sync when connected',
        ),
      ConnectivityStatus.syncing => (
          Icons.cloud_sync,
          Colors.blue,
          'Syncing $pendingCount pending action(s)...',
        ),
      ConnectivityStatus.online when pendingCount > 0 => (
          Icons.cloud_upload,
          Colors.amber,
          '$pendingCount pending sync action(s)',
        ),
      _ => (Icons.cloud_done, Colors.green, 'Connected'),
    };

    return Tooltip(
      message: tooltip,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Icon(icon, color: color, size: 20),
      ),
    );
  }
}

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(connectivityStatusProvider);

    if (status == ConnectivityStatus.online) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      color: status == ConnectivityStatus.offline ? Colors.orange[700] : Colors.blue[700],
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            status == ConnectivityStatus.offline ? Icons.cloud_off : Icons.cloud_sync,
            color: Colors.white,
            size: 16,
          ),
          const SizedBox(width: 8),
          Text(
            status == ConnectivityStatus.offline
                ? 'You are offline — viewing cached data'
                : 'Syncing changes...',
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
