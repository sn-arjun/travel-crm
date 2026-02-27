import 'dart:io';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:shared/shared.dart';

part 'import_wizard_state.freezed.dart';

enum ImportWizardStep {
  uploadFile,
  mapColumns,
  preview,
  execution,
}

@freezed
abstract class ImportWizardState with _$ImportWizardState {
  const factory ImportWizardState({
    @Default(ImportWizardStep.uploadFile) ImportWizardStep currentStep,
    @Default('contacts') String selectedType,
    File? selectedFile,
    @Default(false) bool isUploading,
    String? uploadError,
    ImportJobModel? currentJob,
    
    // Step 2: Mapping
    @Default({}) Map<String, String> columnMapping,
    
    // Step 3: Preview
    @Default('skip') String duplicateStrategy,
    
    // Step 4: Execution
    @Default(false) bool isExecuting,
    String? executionError,
    
    // General
    @Default(false) bool isPolling,
    @Default([]) List<ImportErrorModel> importErrors,
  }) = _ImportWizardState;
}
