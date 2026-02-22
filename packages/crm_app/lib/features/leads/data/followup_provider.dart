import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';
import 'followup_repository.dart';

// ── Repository Provider ─────────────────────────────────────

final followUpRepositoryProvider = Provider<FollowUpRepository>(
  (ref) => FollowUpRepository(apiClient: ref.read(apiClientProvider)),
);

// ── My Follow-Ups Provider (tabbed: today / upcoming / overdue) ─

enum FollowUpTab { today, upcoming, overdue }

class FollowUpListState {
  final Map<FollowUpTab, List<FollowUpModel>> items;
  final Map<FollowUpTab, bool> loading;
  final String? error;

  const FollowUpListState({
    this.items = const {
      FollowUpTab.today: [],
      FollowUpTab.upcoming: [],
      FollowUpTab.overdue: [],
    },
    this.loading = const {
      FollowUpTab.today: false,
      FollowUpTab.upcoming: false,
      FollowUpTab.overdue: false,
    },
    this.error,
  });

  FollowUpListState copyWith({
    Map<FollowUpTab, List<FollowUpModel>>? items,
    Map<FollowUpTab, bool>? loading,
    String? error,
  }) {
    return FollowUpListState(
      items: items ?? this.items,
      loading: loading ?? this.loading,
      error: error,
    );
  }

  List<FollowUpModel> get todayItems => items[FollowUpTab.today] ?? [];
  List<FollowUpModel> get upcomingItems => items[FollowUpTab.upcoming] ?? [];
  List<FollowUpModel> get overdueItems => items[FollowUpTab.overdue] ?? [];
  int get overdueCount => overdueItems.length;
}

final myFollowUpsProvider =
    StateNotifierProvider<MyFollowUpsNotifier, FollowUpListState>(
  (ref) => MyFollowUpsNotifier(
    repository: ref.read(followUpRepositoryProvider),
  ),
);

class MyFollowUpsNotifier extends StateNotifier<FollowUpListState> {
  final FollowUpRepository _repository;

  MyFollowUpsNotifier({required FollowUpRepository repository})
      : _repository = repository,
        super(const FollowUpListState());

  Future<void> loadAll({bool team = false}) async {
    await Future.wait([
      loadTab(FollowUpTab.today, team: team),
      loadTab(FollowUpTab.upcoming, team: team),
      loadTab(FollowUpTab.overdue, team: team),
    ]);
  }

  Future<void> loadTab(FollowUpTab tab, {bool team = false}) async {
    state = state.copyWith(
      loading: {...state.loading, tab: true},
    );

    try {
      final filter = switch (tab) {
        FollowUpTab.today => 'today',
        FollowUpTab.upcoming => 'upcoming',
        FollowUpTab.overdue => 'overdue',
      };
      final items = await _repository.getFollowUps(filter: filter, team: team);
      state = state.copyWith(
        items: {...state.items, tab: items},
        loading: {...state.loading, tab: false},
      );
    } catch (e) {
      state = state.copyWith(
        loading: {...state.loading, tab: false},
        error: e is ApiException ? e.message : 'Failed to load follow-ups',
      );
    }
  }

  Future<void> completeFollowUp(String id, {String? outcomeNotes}) async {
    try {
      await _repository.completeFollowUp(id, outcomeNotes: outcomeNotes);
      // Remove from today/overdue lists
      final updated = <FollowUpTab, List<FollowUpModel>>{};
      for (final tab in FollowUpTab.values) {
        updated[tab] = (state.items[tab] ?? [])
            .where((f) => f.id != id)
            .toList();
      }
      state = state.copyWith(items: updated);
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to complete follow-up',
      );
    }
  }

  Future<void> cancelFollowUp(String id) async {
    try {
      await _repository.cancelFollowUp(id);
      final updated = <FollowUpTab, List<FollowUpModel>>{};
      for (final tab in FollowUpTab.values) {
        updated[tab] = (state.items[tab] ?? [])
            .where((f) => f.id != id)
            .toList();
      }
      state = state.copyWith(items: updated);
    } catch (e) {
      state = state.copyWith(
        error: e is ApiException ? e.message : 'Failed to cancel follow-up',
      );
    }
  }
}

// ── Overdue count — auto-refreshes every 5 minutes ──────────

final overdueFollowUpsCountProvider = StreamProvider<int>((ref) async* {
  final repo = ref.read(followUpRepositoryProvider);

  Future<int> fetchCount() async {
    try {
      final items = await repo.getFollowUps(filter: 'overdue');
      return items.length;
    } catch (_) {
      return 0;
    }
  }

  yield await fetchCount();

  await for (final _ in Stream.periodic(const Duration(minutes: 5))) {
    yield await fetchCount();
  }
});
