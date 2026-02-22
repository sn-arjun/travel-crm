import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/feedback/app_confirm_dialog.dart';
import '../../../core/widgets/feedback/app_error_widget.dart';
import '../../../core/widgets/feedback/app_loading.dart';
import '../../../core/widgets/feedback/app_snackbar.dart';
import '../../../core/widgets/layout/app_section_card.dart';
import '../data/contact_provider.dart';
import '../data/contact_state.dart';
import 'widgets/contact_type_badge.dart';
import 'widgets/language_badge.dart';
import 'widgets/source_badge.dart';
import 'widgets/tag_chips.dart';

class ContactDetailScreen extends ConsumerStatefulWidget {
  final String contactId;

  const ContactDetailScreen({super.key, required this.contactId});

  @override
  ConsumerState<ContactDetailScreen> createState() => _ContactDetailScreenState();
}

class _ContactDetailScreenState extends ConsumerState<ContactDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    Future.microtask(() {
      ref.read(contactDetailProvider(widget.contactId).notifier).load();
      ref.read(contactDetailProvider(widget.contactId).notifier).loadTimeline();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(contactDetailProvider(widget.contactId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(state.contact?.name ?? 'Contact'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/contacts'),
        ),
        actions: [
          if (state.contact != null) ...[
            IconButton(
              icon: const Icon(Icons.share_outlined),
              tooltip: 'Share',
              onPressed: () => _showShareDialog(context),
            ),
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit',
              onPressed: () => context.go('/contacts/${widget.contactId}/edit'),
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Delete',
              onPressed: () => _confirmDelete(context),
            ),
          ],
        ],
      ),
      body: _buildBody(context, state, theme),
    );
  }

  Widget _buildBody(BuildContext context, ContactDetailState state, ThemeData theme) {
    if (state.status == ContactDetailStatus.loading) {
      return const AppLoading();
    }

    if (state.status == ContactDetailStatus.error) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load contact',
        onRetry: () =>
            ref.read(contactDetailProvider(widget.contactId).notifier).load(),
      );
    }

    final contact = state.contact;
    if (contact == null) return const AppLoading();

    return Column(
      children: [
        // Header card
        _ContactHeader(contact: contact),
        // Tabs
        TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Details'),
            Tab(text: 'Activity'),
            Tab(text: 'Timeline'),
          ],
        ),
        // Tab content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _DetailsTab(contact: contact),
              _ActivityTab(contact: contact),
              _TimelineTab(timeline: state.timeline),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await AppConfirmDialog.show(
      context,
      title: 'Delete Contact',
      message: 'Are you sure you want to delete this contact? This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    if (!context.mounted) return;

    try {
      await ref.read(contactRepositoryProvider).deleteContact(widget.contactId);
      if (!context.mounted) return;
      ref.read(contactListProvider.notifier).loadContacts(refresh: true);
      AppSnackbar.success(context, 'Contact deleted');
      context.go('/contacts');
    } catch (e) {
      if (!context.mounted) return;
      AppSnackbar.error(
        context,
        e is ApiException ? e.message : 'Failed to delete contact',
      );
    }
  }

  void _showShareDialog(BuildContext context) {
    // Placeholder — will be implemented in Wave 4
    AppSnackbar.info(context, 'Share feature coming soon');
  }
}

// ── Header ──────────────────────────────────────────────────

class _ContactHeader extends StatelessWidget {
  final ContactModel contact;
  const _ContactHeader({required this.contact});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          CircleAvatar(
            radius: 32,
            backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
            child: Text(
              contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?',
              style: theme.textTheme.headlineMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        contact.name,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    ContactTypeBadge(type: contact.type),
                  ],
                ),
                if (contact.company != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    contact.company!,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
                const SizedBox(height: AppTheme.spacingSm),
                Wrap(
                  spacing: AppTheme.spacingMd,
                  runSpacing: AppTheme.spacingXs,
                  children: [
                    if (contact.email != null)
                      _InfoChip(icon: Icons.email_outlined, text: contact.email!),
                    if (contact.phone != null)
                      _InfoChip(icon: Icons.phone_outlined, text: contact.phone!),
                    if (contact.city != null)
                      _InfoChip(icon: Icons.location_on_outlined, text: contact.city!),
                    SourceBadge(source: contact.source),
                    LanguageBadge(languageCode: contact.preferredLanguage),
                  ],
                ),
                if (contact.tags.isNotEmpty) ...[
                  const SizedBox(height: AppTheme.spacingSm),
                  TagChips(tags: contact.tags),
                ],
              ],
            ),
          ),
          // Stats
          const SizedBox(width: AppTheme.spacingLg),
          Column(
            children: [
              _StatBox(label: 'Leads', value: '${contact.leadsCount ?? 0}'),
              const SizedBox(height: AppTheme.spacingSm),
              _StatBox(label: 'Invoices', value: '${contact.invoicesCount ?? 0}'),
              const SizedBox(height: AppTheme.spacingSm),
              _StatBox(label: 'Payments', value: '\u20b9${contact.paymentsTotal ?? 0}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(text, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  const _StatBox({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: 100,
      padding: const EdgeInsets.all(AppTheme.spacingSm),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      ),
      child: Column(
        children: [
          Text(value,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          Text(label, style: theme.textTheme.labelSmall),
        ],
      ),
    );
  }
}

// ── Details Tab ─────────────────────────────────────────────

class _DetailsTab extends StatelessWidget {
  final ContactModel contact;
  const _DetailsTab({required this.contact});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 800),
          child: Column(
            children: [
              AppSectionCard(
                title: 'Contact Information',
                child: Column(
                  children: [
                    _DetailRow(label: 'Email', value: contact.email),
                    _DetailRow(label: 'Phone', value: contact.phone),
                    _DetailRow(label: 'Company', value: contact.company),
                    _DetailRow(label: 'Source', value: contact.source),
                    _DetailRow(label: 'Language', value: contact.preferredLanguage),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
              AppSectionCard(
                title: 'Address',
                child: Column(
                  children: [
                    _DetailRow(label: 'Address', value: contact.address),
                    _DetailRow(label: 'City', value: contact.city),
                    _DetailRow(label: 'State', value: contact.state),
                    _DetailRow(label: 'Country', value: contact.country),
                    _DetailRow(label: 'Postal Code', value: contact.postalCode),
                  ],
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
              AppSectionCard(
                title: 'Occasions',
                child: Column(
                  children: [
                    _DetailRow(label: 'Birthday', value: contact.birthday),
                    _DetailRow(label: 'Anniversary', value: contact.anniversary),
                  ],
                ),
              ),
              if (contact.notes != null && contact.notes!.isNotEmpty) ...[
                const SizedBox(height: AppTheme.spacingMd),
                AppSectionCard(
                  title: 'Notes',
                  child: Text(contact.notes!),
                ),
              ],
              if (contact.createdByName != null) ...[
                const SizedBox(height: AppTheme.spacingMd),
                AppSectionCard(
                  title: 'Metadata',
                  child: Column(
                    children: [
                      _DetailRow(label: 'Created By', value: contact.createdByName),
                      _DetailRow(label: 'Created At', value: contact.createdAt),
                      _DetailRow(label: 'Updated At', value: contact.updatedAt),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String? value;
  const _DetailRow({required this.label, this.value});

  @override
  Widget build(BuildContext context) {
    if (value == null || value!.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(value!, style: theme.textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

// ── Activity Tab ────────────────────────────────────────────

class _ActivityTab extends StatelessWidget {
  final ContactModel contact;
  const _ActivityTab({required this.contact});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.analytics_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
          const SizedBox(height: AppTheme.spacingMd),
          Text(
            'Leads, invoices, and payments for this contact',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Text('${contact.leadsCount ?? 0} leads  |  '
              '${contact.invoicesCount ?? 0} invoices  |  '
              '\u20b9${contact.paymentsTotal ?? 0} paid'),
        ],
      ),
    );
  }
}

// ── Timeline Tab ────────────────────────────────────────────

class _TimelineTab extends StatelessWidget {
  final List<TimelineEntry> timeline;
  const _TimelineTab({required this.timeline});

  @override
  Widget build(BuildContext context) {
    if (timeline.isEmpty) {
      return const Center(child: Text('No timeline entries yet'));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: timeline.length,
      itemBuilder: (context, index) {
        final entry = timeline[index];
        return _TimelineItem(entry: entry);
      },
    );
  }
}

class _TimelineItem extends StatelessWidget {
  final TimelineEntry entry;
  const _TimelineItem({required this.entry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _entryStyle(entry.type);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: AppTheme.spacingSm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.title,
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (entry.description != null)
                  Text(entry.description!, style: theme.textTheme.bodySmall),
                const SizedBox(height: 2),
                Text(
                  '${entry.createdAt}${entry.createdByName != null ? '  by ${entry.createdByName}' : ''}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static (IconData, Color) _entryStyle(String type) {
    return switch (type) {
      'lead' => (Icons.trending_up, const Color(0xFF1E88E5)),
      'invoice' => (Icons.receipt_long_outlined, const Color(0xFF26A69A)),
      'payment' => (Icons.payments_outlined, const Color(0xFF4CAF50)),
      'message' => (Icons.chat_bubble_outline, const Color(0xFFFFA726)),
      'activity' => (Icons.history, const Color(0xFF9E9E9E)),
      _ => (Icons.circle, const Color(0xFF9E9E9E)),
    };
  }
}
