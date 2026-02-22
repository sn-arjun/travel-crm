import 'package:flutter/material.dart';

import '../../../../core/widgets/data/app_empty_state.dart';

/// Placeholder tab — invoices feature coming in Milestone 7.
class LeadInvoicesTab extends StatelessWidget {
  const LeadInvoicesTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppEmptyState(
      icon: Icons.receipt_long_outlined,
      title: 'Invoices coming soon',
      subtitle: 'This feature will be available in Milestone 7.',
    );
  }
}
