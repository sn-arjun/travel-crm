import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../data/lead_provider.dart';
import 'followup_card.dart';
import 'schedule_followup_dialog.dart';

/// Follow-ups tab in the lead detail screen.
///
/// Shows upcoming (pending) follow-ups first, then past (completed/missed).
class LeadFollowUpsTab extends ConsumerStatefulWidget {
  final String leadId;

  const LeadFollowUpsTab({super.key, required this.leadId});

  @override
  ConsumerState<LeadFollowUpsTab> createState() => _LeadFollowUpsTabState();
}

class _LeadFollowUpsTabState extends ConsumerState<LeadFollowUpsTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(leadDetailProvider(widget.leadId).notifier).loadFollowUps();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(leadDetailProvider(widget.leadId));

    if (state.followUpsLoading && state.followUps.isEmpty) {
      return const Center(child: AppLoading());
    }

    final upcoming =
        state.followUps.where((f) => f.status == 'pending').toList();
    final past =
        state.followUps.where((f) => f.status != 'pending').toList();

    return Stack(
      children: [
        if (state.followUps.isEmpty)
          const Center(
            child: Text('No follow-ups yet. Tap + to schedule one.'),
          )
        else
          ListView(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              AppTheme.spacingMd,
              80,
            ),
            children: [
              if (upcoming.isNotEmpty) ...[
                _SectionHeader(title: 'Upcoming (${upcoming.length})'),
                ...upcoming.map((f) => FollowUpCard(followUp: f)),
              ],
              if (past.isNotEmpty) ...[
                _SectionHeader(title: 'Past (${past.length})'),
                ...past.map((f) => FollowUpCard(followUp: f)),
              ],
            ],
          ),
        Positioned(
          right: AppTheme.spacingMd,
          bottom: AppTheme.spacingMd,
          child: FloatingActionButton(
            heroTag: 'followup_fab',
            mini: true,
            onPressed: () =>
                ScheduleFollowUpDialog.show(context, widget.leadId),
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}
