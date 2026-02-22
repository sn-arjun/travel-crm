import 'package:flutter/material.dart';
import 'package:shared/shared.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/layout/app_section_card.dart';

/// A card showing contact info for the lead (phone, email, WhatsApp).
class LeadContactSidebar extends StatelessWidget {
  final LeadModel lead;

  const LeadContactSidebar({super.key, required this.lead});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppSectionCard(
      title: 'Contact',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            lead.contactName ?? 'Unknown',
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: AppTheme.spacingSm),
          _ContactAction(
            icon: Icons.phone_outlined,
            label: 'Call',
            onTap: lead.contactName != null
                ? () => _launch('tel:${lead.contactName}')
                : null,
          ),
          _ContactAction(
            icon: Icons.message_outlined,
            label: 'WhatsApp',
            color: const Color(0xFF25D366),
            onTap: lead.contactName != null
                ? () => _launch(
                      'https://wa.me/${lead.contactName?.replaceAll(RegExp(r'\D'), '')}',
                    )
                : null,
          ),
          _ContactAction(
            icon: Icons.email_outlined,
            label: 'Email',
            onTap: null,
          ),
        ],
      ),
    );
  }

  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _ContactAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;

  const _ContactAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color ?? Theme.of(context).colorScheme.primary),
            const SizedBox(width: AppTheme.spacingSm),
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
