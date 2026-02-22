import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/layout/app_section_card.dart';

/// Shows the top hot leads (priority = 'hot') with a link to each.
class HotLeadsWidget extends StatelessWidget {
  final List<LeadModel> hotLeads;

  const HotLeadsWidget({super.key, required this.hotLeads});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppSectionCard(
      title: 'Hot Leads 🔥',
      trailing: TextButton(
        onPressed: () => context.go('/leads'),
        child: const Text('View all'),
      ),
      child: hotLeads.isEmpty
          ? const Padding(
              padding: EdgeInsets.symmetric(vertical: AppTheme.spacingSm),
              child: Text('No hot leads right now.'),
            )
          : Column(
              children: hotLeads.map((lead) {
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    radius: 16,
                    backgroundColor: Color(0xFFFFEBEE),
                    child: Icon(Icons.local_fire_department,
                        color: Colors.red, size: 16),
                  ),
                  title: Text(
                    lead.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    '${lead.destinations.take(2).join(', ')} · '
                    '${lead.currency} ${lead.budget?.toStringAsFixed(0) ?? '—'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                  onTap: () => context.push('/leads/${lead.id}'),
                );
              }).toList(),
            ),
    );
  }
}
