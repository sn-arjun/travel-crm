import 'package:flutter/material.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../data/lead_state.dart';
import 'kanban_column.dart';

class KanbanBoard extends StatelessWidget {
  final PipelineState pipelineState;

  const KanbanBoard({super.key, required this.pipelineState});

  @override
  Widget build(BuildContext context) {
    if (pipelineState.status == PipelineStatus.loading &&
        pipelineState.data == null) {
      return const Center(child: AppLoading());
    }

    if (pipelineState.status == PipelineStatus.error &&
        pipelineState.data == null) {
      return AppErrorWidget(
        message: pipelineState.error ?? 'Failed to load pipeline',
      );
    }

    final stages = pipelineState.data?.stages ?? [];

    if (stages.isEmpty) {
      return const Center(child: Text('No pipeline stages'));
    }

    return ListView.builder(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.all(16.0),
      itemCount: stages.length,
      itemBuilder: (_, i) => KanbanColumn(stage: stages[i]),
    );
  }
}
