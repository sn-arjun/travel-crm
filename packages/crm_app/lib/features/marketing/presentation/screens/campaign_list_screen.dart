import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/providers/marketing_providers.dart';

class MarketingCampaignListScreen extends ConsumerWidget {
  const MarketingCampaignListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(campaignListProvider);
    final notifier = ref.read(campaignListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Campaigns',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                ElevatedButton.icon(
                  onPressed: () => context.go('/marketing/campaigns/new'),
                  icon: const Icon(Icons.add),
                  label: const Text('New Campaign'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search campaigns...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => notifier.updateFilters(search: value),
            ),
          ),
          const SizedBox(height: 8),
          AppFilterBar<String>(
            selectedValue: state.typeFilter,
            onFilterChanged: (value) => notifier.updateFilters(type: value),
            onClear: () => notifier.updateFilters(),
            filters: const [
              FilterItem(label: 'WhatsApp', value: 'whatsapp'),
              FilterItem(label: 'SMS', value: 'sms'),
              FilterItem(label: 'Email', value: 'email'),
            ],
          ),
          AppFilterBar<String>(
            selectedValue: state.statusFilter,
            onFilterChanged: (value) => notifier.updateFilters(status: value),
            onClear: () => notifier.updateFilters(),
            filters: const [
              FilterItem(label: 'Draft', value: 'draft'),
              FilterItem(label: 'Sending', value: 'sending'),
              FilterItem(label: 'Sent', value: 'sent'),
              FilterItem(label: 'Failed', value: 'failed'),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: state.isLoading && state.campaigns.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.campaigns.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.campaign, size: 64, color: Colors.grey[400]),
                        const SizedBox(height: 16),
                        Text(
                          'No campaigns yet',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () =>
                              context.go('/marketing/campaigns/new'),
                          child: const Text('Create Campaign'),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: state.campaigns.length,
                    itemBuilder: (context, index) {
                      final campaign = state.campaigns[index];
                      return Card(
                        child: ListTile(
                          leading: _typeAvatar(campaign.type),
                          title: Text(campaign.name),
                          subtitle: Text(
                            '${campaign.type.toUpperCase()} • ${campaign.totalRecipients} recipients',
                          ),
                          trailing: _statusChip(campaign.status),
                          onTap: () =>
                              context.go('/marketing/campaigns/${campaign.id}'),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _typeAvatar(String type) {
    final (color, icon) = switch (type) {
      'whatsapp' => (const Color(0xFF25D366), Icons.chat),
      'sms' => (Colors.blue, Icons.sms),
      'email' => (Colors.orange, Icons.email),
      _ => (Colors.grey, Icons.campaign),
    };
    return CircleAvatar(
      backgroundColor: color,
      child: Icon(icon, color: Colors.white, size: 20),
    );
  }

  Widget _statusChip(String status) {
    final (color, label) = switch (status) {
      'draft' => (Colors.grey, 'Draft'),
      'scheduled' => (Colors.blue, 'Scheduled'),
      'sending' => (Colors.orange, 'Sending'),
      'sent' => (Colors.green, 'Sent'),
      'failed' => (Colors.red, 'Failed'),
      'cancelled' => (Colors.red, 'Cancelled'),
      _ => (Colors.grey, status),
    };
    return Chip(
      label: Text(label, style: TextStyle(color: color, fontSize: 12)),
      side: BorderSide(color: color),
      backgroundColor: color.withValues(alpha: 0.1),
    );
  }
}
