import 'package:flutter/material.dart';

import '../../../../core/widgets/data/app_empty_state.dart';

/// Placeholder tab — document uploads to be wired in a future milestone.
class LeadDocumentsTab extends StatelessWidget {
  const LeadDocumentsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppEmptyState(
      icon: Icons.folder_outlined,
      title: 'Documents',
      subtitle: 'Document upload will be wired in a future milestone.',
    );
  }
}
