import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/data/app_stat_card.dart';
import '../../data/providers/marketing_providers.dart';

class CampaignDetailScreen extends ConsumerStatefulWidget {
  final String id;

  const CampaignDetailScreen({super.key, required this.id});

  @override
  ConsumerState<CampaignDetailScreen> createState() =>
      _CampaignDetailScreenState();
}

class _CampaignDetailScreenState extends ConsumerState<CampaignDetailScreen> {
  MarketingCampaignModel? _campaign;
  CampaignAnalyticsModel? _analytics;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final repo = ref.read(marketingCampaignRepositoryProvider);
      final campaign = await repo.getCampaign(widget.id);
      final analytics = await repo.getCampaignAnalytics(widget.id);
      setState(() {
        _campaign = campaign;
        _analytics = analytics;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _sendCampaign() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Send Campaign'),
        content: Text(
          'Are you sure you want to send "${_campaign?.name}" to all recipients?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Send'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        final repo = ref.read(marketingCampaignRepositoryProvider);
        await repo.sendCampaign(widget.id);
        _loadData();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Campaign sending started!')),
        );
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_campaign == null) {
      return const Scaffold(body: Center(child: Text('Campaign not found')));
    }

    final campaign = _campaign!;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      campaign.name,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Chip(label: Text(campaign.type.toUpperCase())),
                        const SizedBox(width: 8),
                        Chip(label: Text(campaign.status.toUpperCase())),
                      ],
                    ),
                  ],
                ),
                if (campaign.status == 'draft')
                  ElevatedButton.icon(
                    onPressed: _sendCampaign,
                    icon: const Icon(Icons.send),
                    label: const Text('Send Now'),
                  ),
              ],
            ),
            const SizedBox(height: 24),

            // Analytics
            if (_analytics != null) ...[
              Text('Analytics', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppStatCard(
                      title: 'Total',
                      value: _analytics!.totalRecipients.toString(),
                      icon: Icons.people,
                      iconColor: Colors.blue,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppStatCard(
                      title: 'Sent',
                      value: _analytics!.sent.toString(),
                      icon: Icons.send,
                      iconColor: Colors.green,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppStatCard(
                      title: 'Delivered',
                      value: _analytics!.delivered.toString(),
                      icon: Icons.done_all,
                      iconColor: Colors.teal,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppStatCard(
                      title: 'Failed',
                      value: _analytics!.failed.toString(),
                      icon: Icons.error,
                      iconColor: Colors.red,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _metricColumn(
                        'Delivery Rate',
                        '${_analytics!.deliveryRate}%',
                      ),
                      _metricColumn('Opened', _analytics!.opened.toString()),
                      _metricColumn('Clicked', _analytics!.clicked.toString()),
                      _metricColumn(
                        'Opted Out',
                        _analytics!.optedOut.toString(),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Campaign Details
            Text('Details', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (campaign.messageBody != null) ...[
                      const Text(
                        'Message',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(campaign.messageBody!),
                      const SizedBox(height: 12),
                    ],
                    if (campaign.emailSubject != null) ...[
                      const Text(
                        'Subject',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(campaign.emailSubject!),
                      const SizedBox(height: 12),
                    ],
                    Text('Created: ${campaign.createdAt ?? '-'}'),
                    if (campaign.scheduledAt != null)
                      Text('Scheduled: ${campaign.scheduledAt}'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metricColumn(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
      ],
    );
  }
}
