import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/import_wizard_provider.dart';
import '../providers/import_wizard_state.dart';
import 'widgets/step_1_upload.dart';
import 'widgets/step_2_mapping.dart';
import 'widgets/step_3_preview.dart';
import 'widgets/step_4_execution.dart';

class ImportWizardScreen extends ConsumerWidget {
  const ImportWizardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(importWizardProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Data Import Wizard'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Stepper(
        type: StepperType.horizontal,
        currentStep: state.currentStep.index,
        controlsBuilder: (context, details) => const SizedBox.shrink(), 
        steps: [
          Step(
            title: const Text('Upload'),
            content: const Step1Upload(),
            isActive: state.currentStep.index >= 0,
            state: state.currentStep.index > 0 ? StepState.complete : StepState.indexed,
          ),
          Step(
            title: const Text('Map Columns'),
            content: const Step2Mapping(),
            isActive: state.currentStep.index >= 1,
            state: state.currentStep.index > 1 ? StepState.complete : StepState.indexed,
          ),
          Step(
            title: const Text('Preview'),
            content: const Step3Preview(),
            isActive: state.currentStep.index >= 2,
            state: state.currentStep.index > 2 ? StepState.complete : StepState.indexed,
          ),
          Step(
            title: const Text('Execute'),
            content: const Step4Execution(),
            isActive: state.currentStep.index >= 3,
            state: state.currentStep == ImportWizardStep.execution ? StepState.editing : StepState.indexed,
          ),
        ],
      ),
    );
  }
}
