import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_empty_state.dart';

class CampaignListScreen extends ConsumerStatefulWidget {
  const CampaignListScreen({super.key});

  @override
  ConsumerState<CampaignListScreen> createState() => _CampaignListScreenState();
}

class _CampaignListScreenState extends ConsumerState<CampaignListScreen> {
  String? _statusFilter;

  // Mock campaigns data
  final List<Map<String, dynamic>> _campaigns = [
    {
      'id': '1',
      'name': 'Welcome Campaign',
      'status': 'active',
      'sent': 125,
      'opened': 87,
      'clicked': 34,
      'createdAt': DateTime.now().subtract(const Duration(days: 2)),
    },
    {
      'id': '2',
      'name': 'Special Offer',
      'status': 'completed',
      'sent': 250,
      'opened': 150,
      'clicked': 45,
      'createdAt': DateTime.now().subtract(const Duration(days: 7)),
    },
    {
      'id': '3',
      'name': 'Feedback Request',
      'status': 'draft',
      'sent': 0,
      'opened': 0,
      'clicked': 0,
      'createdAt': DateTime.now().subtract(const Duration(days: 1)),
    },
  ];

  @override
  Widget build(BuildContext context) {
    final filteredCampaigns = _statusFilter == null
        ? _campaigns
        : _campaigns
            .where((c) => c['status'] == _statusFilter)
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Email Campaigns'),
      ),
      body: Column(
        children: [
          // Status filter
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: ['All', 'Draft', 'Active', 'Completed']
                    .map((status) {
                      final value = status == 'All' ? null : status.toLowerCase();
                      final isSelected = _statusFilter == value;

                      return Padding(
                        padding: const EdgeInsets.only(
                          right: AppTheme.spacingSm,
                        ),
                        child: FilterChip(
                          selected: isSelected,
                          label: Text(status),
                          onSelected: (_) {
                            setState(() => _statusFilter = value);
                          },
                        ),
                      );
                    })
                    .toList(),
              ),
            ),
          ),
          const Divider(height: 1),
          // Campaigns list
          Expanded(
            child: filteredCampaigns.isEmpty
                ? const Center(
                    child: AppEmptyState(
                      title: 'No campaigns',
                      description: 'Create your first email campaign',
                      icon: Icons.campaign_rounded,
                    ),
                  )
                : ListView.builder(
                    itemCount: filteredCampaigns.length,
                    itemBuilder: (context, index) {
                      final campaign = filteredCampaigns[index];
                      return _buildCampaignCard(context, campaign);
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/campaigns/new'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Campaign'),
      ),
    );
  }

  Widget _buildCampaignCard(
    BuildContext context,
    Map<String, dynamic> campaign,
  ) {
    final theme = Theme.of(context);
    final statusColor = _getStatusColor(campaign['status']);

    return Card(
      margin: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: ListTile(
        onTap: () => context.push('/campaigns/${campaign['id']}'),
        leading: Container(
          padding: const EdgeInsets.all(AppTheme.spacingSm),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          ),
          child: Icon(
            _getStatusIcon(campaign['status']),
            color: statusColor,
          ),
        ),
        title: Text(campaign['name']),
        subtitle: Text(
          'Sent: ${campaign['sent']} | Opened: ${campaign['opened']} | Clicked: ${campaign['clicked']}',
          style: theme.textTheme.labelSmall,
        ),
        trailing: Chip(
          label: Text(campaign['status'].toUpperCase()),
          backgroundColor: statusColor.withValues(alpha: 0.2),
          labelStyle: TextStyle(
            color: statusColor,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'draft':
        return AppTheme.colorGrey600;
      case 'active':
        return const Color(0xFF4CAF50);
      case 'completed':
        return const Color(0xFF2196F3);
      case 'paused':
        return const Color(0xFFFF9800);
      default:
        return AppTheme.colorGrey500;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'draft':
        return Icons.drafts_rounded;
      case 'active':
        return Icons.play_circle_filled_rounded;
      case 'completed':
        return Icons.check_circle_rounded;
      case 'paused':
        return Icons.pause_circle_filled_rounded;
      default:
        return Icons.help_rounded;
    }
  }
}
