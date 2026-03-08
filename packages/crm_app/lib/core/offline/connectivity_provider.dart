import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ConnectivityStatus { online, offline, syncing }

final connectivityStatusProvider =
    StateNotifierProvider<ConnectivityNotifier, ConnectivityStatus>((ref) {
  return ConnectivityNotifier();
});

class ConnectivityNotifier extends StateNotifier<ConnectivityStatus> {
  late final StreamSubscription<List<ConnectivityResult>> _subscription;

  ConnectivityNotifier() : super(ConnectivityStatus.online) {
    _subscription = Connectivity().onConnectivityChanged.listen(_onChanged);
    // Check initial status
    Connectivity().checkConnectivity().then(_onChanged);
  }

  void _onChanged(List<ConnectivityResult> results) {
    final hasConnection = results.any((r) => r != ConnectivityResult.none);
    if (hasConnection && state == ConnectivityStatus.offline) {
      state = ConnectivityStatus.syncing;
      // After a brief sync period, go to online
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) state = ConnectivityStatus.online;
      });
    } else if (!hasConnection) {
      state = ConnectivityStatus.offline;
    }
  }

  void setSyncing() {
    state = ConnectivityStatus.syncing;
  }

  void setOnline() {
    state = ConnectivityStatus.online;
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
