import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'connectivity_provider.dart';
import 'offline_cache_manager.dart';

final syncManagerProvider = Provider<SyncManager>((ref) {
  return SyncManager(ref);
});

class SyncManager {
  final Ref _ref;

  SyncManager(this._ref);

  Future<void> syncPendingActions(Dio dio) async {
    final cache = _ref.read(offlineCacheManagerProvider);
    final actions = cache.getPendingActions();

    if (actions.isEmpty) return;

    _ref.read(connectivityStatusProvider.notifier).setSyncing();

    final failed = <Map<String, dynamic>>[];

    for (final action in actions) {
      try {
        final entityType = action['entity_type'] as String;
        final entityId = action['entity_id'] as String?;
        final payload = action['payload'] as Map<String, dynamic>;
        final type = action['type'] as String;

        switch (type) {
          case 'create':
            await dio.post('/api/v1/$entityType', data: payload);
          case 'update':
            if (entityId != null) {
              await dio.put('/api/v1/$entityType/$entityId', data: payload);
            }
          case 'delete':
            if (entityId != null) {
              await dio.delete('/api/v1/$entityType/$entityId');
            }
        }
        await cache.removeAction(action['id'] as String);
      } catch (e) {
        // If server rejected, keep for error display; if network error, stop syncing
        if (e is DioException && e.type == DioExceptionType.connectionError) {
          break; // Still offline, stop trying
        }
        failed.add(action);
        await cache.removeAction(action['id'] as String);
      }
    }

    _ref.read(connectivityStatusProvider.notifier).setOnline();
  }
}
