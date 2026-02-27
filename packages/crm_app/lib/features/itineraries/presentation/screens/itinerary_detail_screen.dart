import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';
import '../widgets/itinerary_status_badge.dart';

class ItineraryDetailScreen extends ConsumerStatefulWidget {
  final String itineraryId;

  const ItineraryDetailScreen({super.key, required this.itineraryId});

  @override
  ConsumerState<ItineraryDetailScreen> createState() =>
      _ItineraryDetailScreenState();
}

class _ItineraryDetailScreenState
    extends ConsumerState<ItineraryDetailScreen> {
  final _expandedDays = <int>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(itineraryDetailProvider(widget.itineraryId).notifier)
          .load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(itineraryDetailProvider(widget.itineraryId));
    final theme = Theme.of(context);

    if (state.status == ItineraryDetailStatus.loading &&
        state.itinerary == null) {
      return const Scaffold(body: Center(child: AppLoading()));
    }

    if (state.status == ItineraryDetailStatus.error &&
        state.itinerary == null) {
      return Scaffold(
        body: AppErrorWidget(
          message: state.error ?? 'Failed to load itinerary',
          onRetry: () => ref
              .read(itineraryDetailProvider(widget.itineraryId).notifier)
              .load(),
        ),
      );
    }

    final itinerary = state.itinerary;
    if (itinerary == null) return const Scaffold(body: SizedBox());

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                itinerary.title,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: AppTheme.spacingSm),
            _VersionBadge(version: itinerary.version),
            const SizedBox(width: AppTheme.spacingSm),
            ItineraryStatusBadge(status: itinerary.status),
          ],
        ),
        actions: [
          if (state.status == ItineraryDetailStatus.saving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          PopupMenuButton<String>(
            onSelected: (value) => _handleMenuAction(value, itinerary),
            itemBuilder: (context) => [
              if (itinerary.status == 'draft')
                const PopupMenuItem(
                  value: 'edit',
                  child: ListTile(
                    leading: Icon(Icons.edit_outlined),
                    title: Text('Edit'),
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
                ),
              if (itinerary.status == 'sent' ||
                  itinerary.status == 'approved')
                const PopupMenuItem(
                  value: 'new_version',
                  child: ListTile(
                    leading: Icon(Icons.add_circle_outline),
                    title: Text('Create New Version'),
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
                ),
              const PopupMenuItem(
                value: 'clone',
                child: ListTile(
                  leading: Icon(Icons.copy_outlined),
                  title: Text('Clone'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'email',
                child: ListTile(
                  leading: Icon(Icons.email_outlined),
                  title: Text('Send via Email'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
              const PopupMenuItem(
                value: 'whatsapp',
                child: ListTile(
                  leading: Icon(Icons.chat_outlined),
                  title: Text('Send via WhatsApp'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
              const PopupMenuItem(
                value: 'share_link',
                child: ListTile(
                  leading: Icon(Icons.link_outlined),
                  title: Text('Share Link'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref
            .read(itineraryDetailProvider(widget.itineraryId).notifier)
            .load(),
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // Header Section
            _HeaderSection(itinerary: itinerary),
            const SizedBox(height: AppTheme.spacingMd),

            // Day-by-day cards
            if (itinerary.days.isNotEmpty) ...[
              Text(
                'Itinerary',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppTheme.spacingSm),
              ...itinerary.days.map(
                (day) => _DayCard(
                  day: day,
                  currency: itinerary.currency,
                  isExpanded: _expandedDays.contains(day.dayNumber),
                  onToggle: () {
                    setState(() {
                      if (_expandedDays.contains(day.dayNumber)) {
                        _expandedDays.remove(day.dayNumber);
                      } else {
                        _expandedDays.add(day.dayNumber);
                      }
                    });
                  },
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Pricing Summary
            _PricingSummary(itinerary: itinerary),
            const SizedBox(height: AppTheme.spacingMd),

            // Inclusions
            if (itinerary.inclusions.isNotEmpty) ...[
              _BulletListSection(
                title: 'Inclusions',
                items: itinerary.inclusions,
                icon: Icons.check_circle_outline,
                iconColor: AppTheme.successColor,
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Exclusions
            if (itinerary.exclusions.isNotEmpty) ...[
              _BulletListSection(
                title: 'Exclusions',
                items: itinerary.exclusions,
                icon: Icons.cancel_outlined,
                iconColor: AppTheme.errorColor,
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Terms & Conditions
            if (itinerary.termsConditions != null &&
                itinerary.termsConditions!.isNotEmpty) ...[
              AppSectionCard(
                title: 'Terms & Conditions',
                child: Text(
                  itinerary.termsConditions!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    height: 1.6,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Version History
            _VersionHistorySection(itineraryId: itinerary.id),
            const SizedBox(height: AppTheme.spacingMd),

            // Action Buttons
            _ActionButtons(
              itinerary: itinerary,
              onEdit: () => context.push(
                '/itineraries/${itinerary.id}/edit',
              ),
              onNewVersion: () => _handleNewVersion(),
              onClone: () => _handleClone(itinerary),
              onSendEmail: () => _showSendEmailDialog(itinerary),
              onSendWhatsApp: () => _showSendWhatsAppDialog(itinerary),
              onShareLink: () => _handleShareLink(),
            ),
            const SizedBox(height: AppTheme.spacingXl),
          ],
        ),
      ),
    );
  }

  // ── Menu actions ──────────────────────────────────────────────

  void _handleMenuAction(String action, ItineraryModel itinerary) {
    switch (action) {
      case 'edit':
        context.push('/itineraries/${itinerary.id}/edit');
      case 'new_version':
        _handleNewVersion();
      case 'clone':
        _handleClone(itinerary);
      case 'email':
        _showSendEmailDialog(itinerary);
      case 'whatsapp':
        _showSendWhatsAppDialog(itinerary);
      case 'share_link':
        _handleShareLink();
    }
  }

  Future<void> _handleNewVersion() async {
    final notifier =
        ref.read(itineraryDetailProvider(widget.itineraryId).notifier);
    final success = await notifier.createNewVersion();
    if (!mounted) return;
    if (success) {
      AppSnackbar.success(context, 'New version created');
      notifier.load();
    } else {
      AppSnackbar.error(context, 'Failed to create new version');
    }
  }

  Future<void> _handleClone(ItineraryModel itinerary) async {
    try {
      final repo = ref.read(itineraryRepositoryProvider);
      final cloned = await repo.cloneItinerary(itinerary.id);
      if (!mounted) return;
      AppSnackbar.success(context, 'Itinerary cloned successfully');
      context.push('/itineraries/${cloned.id}');
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to clone itinerary');
    }
  }

  Future<void> _handleShareLink() async {
    final notifier =
        ref.read(itineraryDetailProvider(widget.itineraryId).notifier);
    final url = await notifier.createShareLink();
    if (!mounted) return;
    if (url != null) {
      _showShareLinkDialog(url);
    } else {
      AppSnackbar.error(context, 'Failed to create share link');
    }
  }

  // ── Send Email Dialog ─────────────────────────────────────────

  void _showSendEmailDialog(ItineraryModel itinerary) {
    final toController = TextEditingController(
      text: itinerary.contact?['email'] as String? ?? '',
    );
    final subjectController = TextEditingController(
      text: 'Itinerary: ${itinerary.title} (v${itinerary.version})',
    );
    final messageController = TextEditingController(
      text: 'Please find attached your itinerary for review.',
    );

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Send via Email'),
          content: SizedBox(
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: toController,
                  decoration: const InputDecoration(
                    labelText: 'To (Email)',
                    hintText: 'recipient@example.com',
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(
                  controller: subjectController,
                  decoration: const InputDecoration(labelText: 'Subject'),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(
                  controller: messageController,
                  decoration: const InputDecoration(labelText: 'Message'),
                  maxLines: 3,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                Navigator.of(ctx).pop();
                final notifier = ref.read(
                    itineraryDetailProvider(widget.itineraryId).notifier);
                final success = await notifier.sendItinerary(
                  channel: 'email',
                  to: toController.text.trim(),
                  subject: subjectController.text.trim(),
                  message: messageController.text.trim(),
                );
                if (!mounted) return;
                if (success) {
                  AppSnackbar.success(context, 'Email sent successfully');
                } else {
                  AppSnackbar.error(context, 'Failed to send email');
                }
              },
              child: const Text('Send'),
            ),
          ],
        );
      },
    );
  }

  // ── Send WhatsApp Dialog ──────────────────────────────────────

  void _showSendWhatsAppDialog(ItineraryModel itinerary) {
    final toController = TextEditingController(
      text: itinerary.contact?['phone'] as String? ?? '',
    );
    final messagePreview =
        'Hi! Here is your itinerary: "${itinerary.title}" (Version ${itinerary.version}).';

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Send via WhatsApp'),
          content: SizedBox(
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: toController,
                  decoration: const InputDecoration(
                    labelText: 'To (Phone)',
                    hintText: '+91 98765 43210',
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: AppTheme.spacingMd),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16.0),
                  decoration: BoxDecoration(
                    color: Theme.of(ctx)
                        .colorScheme
                        .surfaceContainerHighest,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusSm),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Message Preview',
                        style: Theme.of(ctx)
                            .textTheme
                            .labelSmall
                            ?.copyWith(
                              color: Theme.of(ctx)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                      ),
                      const SizedBox(height: AppTheme.spacingXs),
                      Text(messagePreview),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                Navigator.of(ctx).pop();
                final notifier = ref.read(
                    itineraryDetailProvider(widget.itineraryId).notifier);
                final success = await notifier.sendItinerary(
                  channel: 'whatsapp',
                  to: toController.text.trim(),
                  message: messagePreview,
                );
                if (!mounted) return;
                if (success) {
                  AppSnackbar.success(context, 'WhatsApp message sent');
                } else {
                  AppSnackbar.error(
                      context, 'Failed to send WhatsApp message');
                }
              },
              child: const Text('Send'),
            ),
          ],
        );
      },
    );
  }

  // ── Share Link Dialog ─────────────────────────────────────────

  void _showShareLinkDialog(String url) {
    showDialog(
      context: context,
      builder: (ctx) {
        final theme = Theme.of(ctx);
        return AlertDialog(
          title: const Text('Share Link'),
          content: SizedBox(
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Share this link with the client to view the itinerary:',
                ),
                const SizedBox(height: AppTheme.spacingMd),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16.0),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusSm),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: SelectableText(
                          url,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.copy),
                        tooltip: 'Copy link',
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: url));
                          AppSnackbar.success(
                              ctx, 'Link copied to clipboard');
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Done'),
            ),
          ],
        );
      },
    );
  }
}

// ── Version Badge ───────────────────────────────────────────────

class _VersionBadge extends StatelessWidget {
  final int version;

  const _VersionBadge({required this.version});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.primaryColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.radiusXs),
      ),
      child: Text(
        'v$version',
        style: theme.textTheme.labelSmall?.copyWith(
          color: AppTheme.primaryColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ── Header Section ──────────────────────────────────────────────

class _HeaderSection extends StatelessWidget {
  final ItineraryModel itinerary;

  const _HeaderSection({required this.itinerary});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final contactName =
        itinerary.contact?['name'] as String? ?? 'Unknown Contact';
    final destination =
        itinerary.lead?['destinations'] as List? ?? [];
    final paxAdults = itinerary.lead?['paxAdults'] as int? ?? 0;
    final paxChildren = itinerary.lead?['paxChildren'] as int? ?? 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              itinerary.title,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppTheme.spacingSm),
            Wrap(
              spacing: AppTheme.spacingMd,
              runSpacing: AppTheme.spacingSm,
              children: [
                _InfoChip(
                  icon: Icons.person_outline,
                  label: contactName,
                ),
                if (destination.isNotEmpty)
                  _InfoChip(
                    icon: Icons.place_outlined,
                    label: destination.join(', '),
                  ),
                _InfoChip(
                  icon: Icons.people_outline,
                  label:
                      '$paxAdults Adult${paxAdults != 1 ? 's' : ''}${paxChildren > 0 ? ', $paxChildren Child${paxChildren != 1 ? 'ren' : ''}' : ''}',
                ),
                if (itinerary.validityDate != null)
                  _InfoChip(
                    icon: Icons.event_outlined,
                    label:
                        'Valid till ${_formatDate(itinerary.validityDate!)}',
                  ),
                _InfoChip(
                  icon: Icons.calendar_today_outlined,
                  label: '${itinerary.days.length} Day${itinerary.days.length != 1 ? 's' : ''}',
                ),
              ],
            ),
            if (itinerary.viewCount > 0) ...[
              const SizedBox(height: AppTheme.spacingSm),
              Text(
                'Viewed ${itinerary.viewCount} time${itinerary.viewCount != 1 ? 's' : ''}${itinerary.lastViewedAt != null ? ' - Last: ${_formatDate(itinerary.lastViewedAt!)}' : ''}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return DateFormat('dd MMM yyyy').format(date);
    } catch (_) {
      return isoDate;
    }
  }
}

// ── Info Chip ───────────────────────────────────────────────────

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

// ── Day Card ────────────────────────────────────────────────────

class _DayCard extends StatelessWidget {
  final ItineraryDayModel day;
  final String currency;
  final bool isExpanded;
  final VoidCallback onToggle;

  const _DayCard({
    required this.day,
    required this.currency,
    required this.isExpanded,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Column(
        children: [
          // Day header — always visible
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.1),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Center(
                      child: Text(
                        '${day.dayNumber}',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: AppTheme.primaryColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppTheme.spacingMd),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          day.title ?? 'Day ${day.dayNumber}',
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        if (day.city != null)
                          Text(
                            day.city!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (day.isFreeDay)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.warningColor.withValues(alpha: 0.12),
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusXl),
                      ),
                      child: Text(
                        'Free Day',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppTheme.warningColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  const SizedBox(width: AppTheme.spacingSm),
                  Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),

          // Expandable content
          if (isExpanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (day.description != null &&
                      day.description!.isNotEmpty) ...[
                    Text(
                      day.description!,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: AppTheme.spacingMd),
                  ],
                  if (day.items.isEmpty)
                    Text(
                      'No items for this day',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                    )
                  else
                    ...day.items.map((item) => _ItemRow(
                          item: item,
                          currency: currency,
                        )),
                  if (day.overnightCity != null) ...[
                    const SizedBox(height: AppTheme.spacingSm),
                    Row(
                      children: [
                        Icon(Icons.nights_stay_outlined,
                            size: 16,
                            color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(
                          'Overnight: ${day.overnightCity}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Item Row ────────────────────────────────────────────────────

class _ItemRow extends StatelessWidget {
  final ItineraryItemModel item;
  final String currency;

  const _ItemRow({required this.item, required this.currency});

  IconData _iconForType(String type) {
    return switch (type.toLowerCase()) {
      'hotel' => Icons.hotel,
      'transport' => Icons.directions_car,
      'activity' => Icons.hiking,
      'meal' => Icons.restaurant,
      'flight' => Icons.flight,
      _ => Icons.category_outlined,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = item.sellingPrice * item.quantity;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            _iconForType(item.type),
            size: 20,
            color: AppTheme.primaryColor,
          ),
          const SizedBox(width: AppTheme.spacingSm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                ),
                if (item.timeStart != null || item.timeEnd != null)
                  Text(
                    [
                      if (item.timeStart != null) item.timeStart,
                      if (item.timeEnd != null) item.timeEnd,
                    ].join(' - '),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                if (item.description != null &&
                    item.description!.isNotEmpty)
                  Text(
                    item.description!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.spacingSm),
          Text(
            CurrencyUtils.format(total, currency: currency),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Pricing Summary ─────────────────────────────────────────────

class _PricingSummary extends StatelessWidget {
  final ItineraryModel itinerary;

  const _PricingSummary({required this.itinerary});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = itinerary.currency;

    String markupLabel = 'Markup';
    final markup = itinerary.totalSelling - itinerary.totalCost;
    if (itinerary.markupType == 'percentage' &&
        itinerary.markupValue != null) {
      markupLabel = 'Markup (${itinerary.markupValue}%)';
    } else if (itinerary.markupType == 'fixed' &&
        itinerary.markupValue != null) {
      markupLabel = 'Markup (Fixed)';
    }

    return AppSectionCard(
      title: 'Pricing Summary',
      child: Column(
        children: [
          _PriceRow(
              label: 'Subtotal (Cost)',
              amount: CurrencyUtils.format(itinerary.totalCost,
                  currency: c)),
          const SizedBox(height: AppTheme.spacingXs),
          _PriceRow(
              label: markupLabel,
              amount:
                  CurrencyUtils.format(markup, currency: c)),
          const SizedBox(height: AppTheme.spacingXs),
          _PriceRow(
              label: 'Tax',
              amount: CurrencyUtils.format(itinerary.totalTax,
                  currency: c)),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Grand Total',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(
                CurrencyUtils.format(itinerary.grandTotal,
                    currency: c),
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final String amount;

  const _PriceRow({required this.label, required this.amount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.bodyMedium),
        Text(amount, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

// ── Bullet List Section ─────────────────────────────────────────

class _BulletListSection extends StatelessWidget {
  final String title;
  final List<String> items;
  final IconData icon;
  final Color iconColor;

  const _BulletListSection({
    required this.title,
    required this.items,
    required this.icon,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppSectionCard(
      title: title,
      child: Column(
        children: items
            .map(
              (item) => Padding(
                padding:
                    const EdgeInsets.only(bottom: AppTheme.spacingXs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(icon, size: 18, color: iconColor),
                    const SizedBox(width: AppTheme.spacingSm),
                    Expanded(
                      child: Text(
                        item,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

// ── Version History Section ─────────────────────────────────────

class _VersionHistorySection extends ConsumerStatefulWidget {
  final String itineraryId;

  const _VersionHistorySection({required this.itineraryId});

  @override
  ConsumerState<_VersionHistorySection> createState() =>
      _VersionHistorySectionState();
}

class _VersionHistorySectionState
    extends ConsumerState<_VersionHistorySection> {
  List<Map<String, dynamic>>? _versions;
  bool _loading = false;
  bool _expanded = false;

  Future<void> _loadVersions() async {
    if (_versions != null || _loading) return;
    setState(() => _loading = true);
    try {
      final repo = ref.read(itineraryRepositoryProvider);
      final versions = await repo.getVersions(widget.itineraryId);
      if (mounted) {
        setState(() {
          _versions = versions;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            onTap: () {
              setState(() => _expanded = !_expanded);
              if (_expanded) _loadVersions();
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  const Icon(Icons.history, size: 20),
                  const SizedBox(width: AppTheme.spacingSm),
                  Expanded(
                    child: Text(
                      'Version History',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(16.0),
                child: Center(
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else if (_versions != null && _versions!.isNotEmpty)
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
                itemCount: _versions!.length,
                separatorBuilder: (_, _) =>
                    const Divider(height: 1),
                itemBuilder: (context, index) {
                  final v = _versions![index];
                  final vId = v['id'] as String? ?? '';
                  final vNum = v['version'] as int? ?? 1;
                  final vStatus = v['status'] as String? ?? 'draft';
                  final vDate = v['createdAt'] as String?;

                  return ListTile(
                    dense: true,
                    leading: Text(
                      'v$vNum',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                    title: Text(
                      vStatus[0].toUpperCase() + vStatus.substring(1),
                    ),
                    subtitle: vDate != null
                        ? Text(
                            _formatDate(vDate),
                            style: theme.textTheme.bodySmall,
                          )
                        : null,
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.push('/itineraries/$vId'),
                  );
                },
              )
            else
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text(
                  'No other versions',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      return DateFormat('dd MMM yyyy, HH:mm').format(date);
    } catch (_) {
      return isoDate;
    }
  }
}

// ── Action Buttons ──────────────────────────────────────────────

class _ActionButtons extends StatelessWidget {
  final ItineraryModel itinerary;
  final VoidCallback onEdit;
  final VoidCallback onNewVersion;
  final VoidCallback onClone;
  final VoidCallback onSendEmail;
  final VoidCallback onSendWhatsApp;
  final VoidCallback onShareLink;

  const _ActionButtons({
    required this.itinerary,
    required this.onEdit,
    required this.onNewVersion,
    required this.onClone,
    required this.onSendEmail,
    required this.onSendWhatsApp,
    required this.onShareLink,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppTheme.spacingSm,
      runSpacing: AppTheme.spacingSm,
      children: [
        if (itinerary.status == 'draft')
          FilledButton.icon(
            onPressed: onEdit,
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Edit'),
          ),
        if (itinerary.status == 'sent' ||
            itinerary.status == 'approved')
          OutlinedButton.icon(
            onPressed: onNewVersion,
            icon: const Icon(Icons.add_circle_outline, size: 18),
            label: const Text('New Version'),
          ),
        OutlinedButton.icon(
          onPressed: onClone,
          icon: const Icon(Icons.copy_outlined, size: 18),
          label: const Text('Clone'),
        ),
        OutlinedButton.icon(
          onPressed: onSendEmail,
          icon: const Icon(Icons.email_outlined, size: 18),
          label: const Text('Email'),
        ),
        OutlinedButton.icon(
          onPressed: onSendWhatsApp,
          icon: const Icon(Icons.chat_outlined, size: 18),
          label: const Text('WhatsApp'),
        ),
        OutlinedButton.icon(
          onPressed: onShareLink,
          icon: const Icon(Icons.link_outlined, size: 18),
          label: const Text('Share Link'),
        ),
      ],
    );
  }
}
