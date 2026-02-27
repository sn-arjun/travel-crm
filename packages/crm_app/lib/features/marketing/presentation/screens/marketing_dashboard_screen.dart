import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/data/app_stat_card.dart';
import '../../data/providers/marketing_providers.dart';

class MarketingDashboardScreen extends ConsumerWidget {
  const MarketingDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final templateState = ref.watch(flyerTemplateListProvider);
    final campaignState = ref.watch(campaignListProvider);
    final segmentState = ref.watch(segmentListProvider);

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
                Text(
                  'Marketing Hub',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Row(
                  children: [
                    ElevatedButton.icon(
                      onPressed: () => context.go('/marketing/templates'),
                      icon: const Icon(Icons.add),
                      label: const Text('Create Flyer'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () => context.go('/marketing/campaigns/new'),
                      icon: const Icon(Icons.campaign),
                      label: const Text('New Campaign'),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Stat Cards
            Row(
              children: [
                Expanded(
                  child: AppStatCard(
                    title: 'Templates',
                    value: templateState.totalItems.toString(),
                    icon: Icons.dashboard,
                    iconColor: Colors.blue,
                    onTap: () => context.go('/marketing/templates'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: AppStatCard(
                    title: 'Campaigns',
                    value: campaignState.campaigns.length.toString(),
                    icon: Icons.campaign,
                    iconColor: Colors.green,
                    onTap: () => context.go('/marketing/campaigns'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: AppStatCard(
                    title: 'Segments',
                    value: segmentState.segments.length.toString(),
                    icon: Icons.people,
                    iconColor: Colors.orange,
                    onTap: () => context.go('/marketing/segments'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Quick Actions
            Text(
              'Quick Actions',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _QuickActionCard(
                  icon: Icons.image,
                  label: 'Template Gallery',
                  onTap: () => context.go('/marketing/templates'),
                ),
                _QuickActionCard(
                  icon: Icons.brush,
                  label: 'Flyer Builder',
                  onTap: () => context.go('/marketing/editor'),
                ),
                _QuickActionCard(
                  icon: Icons.flash_on,
                  label: 'Quick Create',
                  onTap: () => context.go('/marketing/templates'),
                ),
                _QuickActionCard(
                  icon: Icons.campaign,
                  label: 'New Campaign',
                  onTap: () => context.go('/marketing/campaigns/new'),
                ),
                _QuickActionCard(
                  icon: Icons.people,
                  label: 'Segments',
                  onTap: () => context.go('/marketing/segments'),
                ),
                _QuickActionCard(
                  icon: Icons.palette,
                  label: 'Brand Settings',
                  onTap: () => context.go('/marketing/branding'),
                ),
                _QuickActionCard(
                  icon: Icons.photo_library,
                  label: 'My Flyers',
                  onTap: () => context.go('/marketing/my-flyers'),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Recent Campaigns
            Text(
              'Recent Campaigns',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            if (campaignState.isLoading)
              const Center(child: CircularProgressIndicator())
            else if (campaignState.campaigns.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(Icons.campaign, size: 48, color: Colors.grey[400]),
                        const SizedBox(height: 8),
                        Text(
                          'No campaigns yet',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton(
                          onPressed: () =>
                              context.go('/marketing/campaigns/new'),
                          child: const Text('Create Campaign'),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            else
              Card(
                child: ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: campaignState.campaigns.take(5).length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final campaign = campaignState.campaigns[index];
                    return ListTile(
                      leading: _campaignTypeIcon(campaign.type),
                      title: Text(campaign.name),
                      subtitle: Text(
                        '${campaign.status.toUpperCase()} • ${campaign.totalRecipients} recipients',
                      ),
                      trailing: Text(
                        campaign.createdAt?.substring(0, 10) ?? '',
                      ),
                      onTap: () =>
                          context.go('/marketing/campaigns/${campaign.id}'),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _campaignTypeIcon(String type) {
    switch (type) {
      case 'whatsapp':
        return const CircleAvatar(
          backgroundColor: Color(0xFF25D366),
          child: Icon(Icons.chat, color: Colors.white, size: 20),
        );
      case 'sms':
        return const CircleAvatar(
          backgroundColor: Colors.blue,
          child: Icon(Icons.sms, color: Colors.white, size: 20),
        );
      case 'email':
        return const CircleAvatar(
          backgroundColor: Colors.orange,
          child: Icon(Icons.email, color: Colors.white, size: 20),
        );
      default:
        return const CircleAvatar(child: Icon(Icons.campaign));
    }
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 140,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey[300]!),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(icon, size: 32, color: Theme.of(context).primaryColor),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}
