import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../data/lead_provider.dart';
import '../../data/lead_state.dart';
import '../widgets/lead_header.dart';
import '../widgets/lead_stage_progress.dart';
import '../widgets/lead_timeline_tab.dart';
import '../widgets/lead_notes_tab.dart';
import '../widgets/lead_followups_tab.dart';
import '../widgets/lead_itineraries_tab.dart';
import '../widgets/lead_invoices_tab.dart';
import '../widgets/lead_documents_tab.dart';

class LeadDetailScreen extends ConsumerStatefulWidget {
  final String leadId;

  const LeadDetailScreen({super.key, required this.leadId});

  @override
  ConsumerState<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends ConsumerState<LeadDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  static const _tabs = [
    Tab(text: 'Timeline'),
    Tab(text: 'Notes'),
    Tab(text: 'Follow-ups'),
    Tab(text: 'Itineraries'),
    Tab(text: 'Invoices'),
    Tab(text: 'Documents'),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(leadDetailProvider(widget.leadId).notifier).load();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(leadDetailProvider(widget.leadId));

    if (state.status == LeadDetailStatus.loading && state.lead == null) {
      return const Scaffold(body: Center(child: AppLoading()));
    }

    if (state.status == LeadDetailStatus.error && state.lead == null) {
      return Scaffold(
        body: AppErrorWidget(
          message: state.error ?? 'Failed to load lead',
          onRetry: () =>
              ref.read(leadDetailProvider(widget.leadId).notifier).load(),
        ),
      );
    }

    final lead = state.lead;
    if (lead == null) return const Scaffold(body: SizedBox());

    return Scaffold(
      body: Column(
        children: [
          // ── Header ───────────────────────────────────────
          LeadHeader(lead: lead),

          // ── Stage Progress Bar ────────────────────────────
          LeadStageProgress(
            currentStatus: lead.status,
            leadId: lead.id,
          ),

          // ── Tab Bar ───────────────────────────────────────
          TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: _tabs,
          ),

          // ── Tab Views (lazy loaded) ───────────────────────
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                LeadTimelineTab(leadId: lead.id),
                LeadNotesTab(leadId: lead.id),
                LeadFollowUpsTab(leadId: lead.id),
                LeadItinerariesTab(leadId: lead.id),
                const LeadInvoicesTab(),
                const LeadDocumentsTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
