import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../auth/data/auth_provider.dart';
import '../../data/import_repository.dart';
import 'import_wizard_state.dart';

// ── Repository Provider ─────────────────────────────────────
final importRepositoryProvider = Provider<ImportRepository>(
  (ref) => ImportRepository(apiClient: ref.read(apiClientProvider)),
);

// ── Wizard Provider ─────────────────────────────────────────
final importWizardProvider =
    StateNotifierProvider<ImportWizardNotifier, ImportWizardState>((ref) {
  return ImportWizardNotifier(
    repository: ref.read(importRepositoryProvider),
  );
});

class ImportWizardNotifier extends StateNotifier<ImportWizardState> {
  final ImportRepository _repository;
  Timer? _pollingTimer;

  ImportWizardNotifier({required ImportRepository repository})
      : _repository = repository,
        super(const ImportWizardState());

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  void reset() {
    _pollingTimer?.cancel();
    state = const ImportWizardState();
  }

  void setType(String type) {
    state = state.copyWith(selectedType: type);
  }

  void selectFile(File file) {
    state = state.copyWith(selectedFile: file, uploadError: null);
  }

  Future<void> uploadFile() async {
    if (state.selectedFile == null) return;

    state = state.copyWith(isUploading: true, uploadError: null);

    try {
      final job = await _repository.uploadFile(
        state.selectedFile!,
        state.selectedType,
      );

      // Init auto-mapping if columnMapping exists
      Map<String, String> mapping = {};
      if (job.columnMapping != null && job.columnMapping!.isNotEmpty) {
        try {
          final decoded = jsonDecode(job.columnMapping!);
          if (decoded is Map) {
            mapping = Map<String, String>.from(
                decoded.map((k, v) => MapEntry(k.toString(), v.toString())));
          }
        } catch (_) {}
      }

      state = state.copyWith(
        isUploading: false,
        currentJob: job,
        currentStep: ImportWizardStep.mapColumns,
        columnMapping: mapping,
      );
    } catch (e) {
      state = state.copyWith(
        isUploading: false,
        uploadError: e is ApiException ? e.message : e.toString(),
      );
    }
  }

  void updateMapping(String fileColumn, String crmField) {
    final newMapping = Map<String, String>.from(state.columnMapping);
    if (crmField.isEmpty) {
      newMapping.remove(fileColumn);
    } else {
      newMapping[fileColumn] = crmField;
    }
    state = state.copyWith(columnMapping: newMapping);
  }

  void goToPreview() {
    state = state.copyWith(currentStep: ImportWizardStep.preview);
  }

  void goBackToTypes() {
    state = state.copyWith(currentStep: ImportWizardStep.uploadFile);
  }

  void goBackToMapping() {
    state = state.copyWith(currentStep: ImportWizardStep.mapColumns);
  }

  void setDuplicateStrategy(String strategy) {
    state = state.copyWith(duplicateStrategy: strategy);
  }

  Future<void> executeImport() async {
    final jobId = state.currentJob?.id;
    if (jobId == null) return;

    state = state.copyWith(
      isExecuting: true,
      executionError: null,
      currentStep: ImportWizardStep.execution,
    );

    try {
      await _repository.executeImport(
        jobId,
        columnMapping: state.columnMapping,
        duplicateStrategy: state.duplicateStrategy,
      );

      // Successfully queued.
      state = state.copyWith(isExecuting: false, isPolling: true);
      _startPolling(jobId);
    } catch (e) {
      state = state.copyWith(
        isExecuting: false,
        executionError: e is ApiException ? e.message : e.toString(),
      );
    }
  }

  void _startPolling(String jobId) {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      try {
        final job = await _repository.getImportProgress(jobId);
        state = state.copyWith(currentJob: job);

        if (job.status == 'completed' || job.status == 'failed') {
          timer.cancel();
          state = state.copyWith(isPolling: false);

          if (job.errorCount > 0) {
            _loadErrors(jobId);
          }
        }
      } catch (e) {
        // Wait for next tick...
      }
    });
  }

  Future<void> _loadErrors(String jobId) async {
    try {
      final errors = await _repository.getImportErrors(jobId);
      state = state.copyWith(importErrors: errors);
    } catch (e) {
      // Ignore
    }
  }

  String getTemplateUrl() {
    return _repository.getTemplateDownloadUrl(state.selectedType);
  }

  String getErrorDownloadUrl() {
    if (state.currentJob?.id == null) return '';
    return _repository.getErrorDownloadUrl(state.currentJob!.id);
  }
}
