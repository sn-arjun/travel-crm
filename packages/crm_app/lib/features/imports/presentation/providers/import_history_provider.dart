import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../data/import_repository.dart';
import 'import_wizard_provider.dart';

final importHistoryProvider = StateNotifierProvider<ImportHistoryNotifier, AsyncValue<List<ImportJobModel>>>((ref) {
  return ImportHistoryNotifier(repository: ref.read(importRepositoryProvider));
});

class ImportHistoryNotifier extends StateNotifier<AsyncValue<List<ImportJobModel>>> {
  final ImportRepository _repository;

  ImportHistoryNotifier({required ImportRepository repository})
      : _repository = repository,
        super(const AsyncValue.loading()) {
    loadHistory();
  }

  Future<void> loadHistory() async {
    state = const AsyncValue.loading();
    try {
      final jobs = await _repository.getImportJobs();
      state = AsyncValue.data(jobs);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}
