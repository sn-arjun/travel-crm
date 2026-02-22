import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/feedback/app_loading.dart';
import '../../../core/widgets/feedback/app_snackbar.dart';
import '../../../core/widgets/layout/app_section_card.dart';
import '../data/contact_provider.dart';

class ContactMergeScreen extends ConsumerStatefulWidget {
  const ContactMergeScreen({super.key});

  @override
  ConsumerState<ContactMergeScreen> createState() => _ContactMergeScreenState();
}

class _ContactMergeScreenState extends ConsumerState<ContactMergeScreen> {
  final _primaryIdController = TextEditingController();
  final _secondaryIdController = TextEditingController();

  MergePreview? _preview;
  bool _loadingPreview = false;
  bool _merging = false;
  String? _error;

  // Track which contact's value to use per field (true = primary, false = secondary)
  final Map<String, bool> _fieldSelection = {};

  @override
  void dispose() {
    _primaryIdController.dispose();
    _secondaryIdController.dispose();
    super.dispose();
  }

  Future<void> _loadPreview() async {
    final primaryId = _primaryIdController.text.trim();
    final secondaryId = _secondaryIdController.text.trim();

    if (primaryId.isEmpty || secondaryId.isEmpty) {
      setState(() => _error = 'Please enter both contact IDs');
      return;
    }
    if (primaryId == secondaryId) {
      setState(() => _error = 'Cannot merge a contact with itself');
      return;
    }

    setState(() {
      _loadingPreview = true;
      _error = null;
      _preview = null;
      _fieldSelection.clear();
    });

    try {
      final repo = ref.read(contactRepositoryProvider);
      final preview = await repo.getMergePreview(
        primaryId: primaryId,
        secondaryId: secondaryId,
      );
      setState(() {
        _preview = preview;
        _loadingPreview = false;
      });
    } catch (e) {
      setState(() {
        _error = e is ApiException ? e.message : 'Failed to load merge preview';
        _loadingPreview = false;
      });
    }
  }

  Future<void> _executeMerge() async {
    if (_preview == null) return;

    setState(() => _merging = true);

    try {
      final repo = ref.read(contactRepositoryProvider);
      await repo.mergeContacts(
        primaryId: _preview!.primary.id,
        secondaryId: _preview!.secondary.id,
      );

      if (!mounted) return;
      AppSnackbar.success(context, 'Contacts merged successfully');
      ref.read(contactListProvider.notifier).loadContacts(refresh: true);
      context.go('/contacts/${_preview!.primary.id}');
    } catch (e) {
      if (!mounted) return;
      setState(() => _merging = false);
      AppSnackbar.error(
        context,
        e is ApiException ? e.message : 'Failed to merge contacts',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacingLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              IconButton(
                onPressed: () => context.go('/contacts'),
                icon: const Icon(Icons.arrow_back),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Text(
                'Merge Contacts',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingSm),
          Text(
            'Combine two duplicate contacts into one. The secondary contact will be soft-deleted and all related records migrated to the primary.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AppTheme.spacingLg),

          // ID Input
          AppSectionCard(
            title: 'Select Contacts',
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _primaryIdController,
                        decoration: const InputDecoration(
                          labelText: 'Primary Contact ID',
                          hintText: 'Keep this contact',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.person),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacingMd),
                    Expanded(
                      child: TextField(
                        controller: _secondaryIdController,
                        decoration: const InputDecoration(
                          labelText: 'Secondary Contact ID',
                          hintText: 'Will be merged & deleted',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.person_outline),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppTheme.spacingSm),
                  Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                ],
                const SizedBox(height: AppTheme.spacingMd),
                FilledButton.icon(
                  onPressed: _loadingPreview ? null : _loadPreview,
                  icon: const Icon(Icons.compare_arrows, size: 18),
                  label: const Text('Preview Merge'),
                ),
              ],
            ),
          ),

          // Loading
          if (_loadingPreview) ...[
            const SizedBox(height: AppTheme.spacingLg),
            const Center(child: AppLoading()),
          ],

          // Preview
          if (_preview != null) ...[
            const SizedBox(height: AppTheme.spacingLg),
            _buildComparisonTable(theme),
            const SizedBox(height: AppTheme.spacingLg),
            _buildMigrationSummary(theme),
            const SizedBox(height: AppTheme.spacingLg),
            _buildMergeAction(theme),
          ],
        ],
      ),
    );
  }

  Widget _buildComparisonTable(ThemeData theme) {
    final primary = _preview!.primary;
    final secondary = _preview!.secondary;

    final fields = <_ComparisonField>[
      _ComparisonField('Name', primary.name, secondary.name),
      _ComparisonField('Email', primary.email ?? '', secondary.email ?? ''),
      _ComparisonField('Phone', primary.phone ?? '', secondary.phone ?? ''),
      _ComparisonField('Company', primary.company ?? '', secondary.company ?? ''),
      _ComparisonField('Type', primary.type, secondary.type),
      _ComparisonField('Address', primary.address ?? '', secondary.address ?? ''),
      _ComparisonField('City', primary.city ?? '', secondary.city ?? ''),
      _ComparisonField('State', primary.state ?? '', secondary.state ?? ''),
      _ComparisonField('Country', primary.country ?? '', secondary.country ?? ''),
      _ComparisonField('Source', primary.source ?? '', secondary.source ?? ''),
      _ComparisonField('Notes', primary.notes ?? '', secondary.notes ?? ''),
      _ComparisonField('Tags', primary.tags.join(', '), secondary.tags.join(', ')),
      _ComparisonField('Language', primary.preferredLanguage, secondary.preferredLanguage),
    ];

    return AppSectionCard(
      title: 'Side-by-Side Comparison',
      child: Table(
        columnWidths: const {
          0: FlexColumnWidth(1.5),
          1: FlexColumnWidth(3),
          2: FlexColumnWidth(3),
        },
        border: TableBorder.all(
          color: theme.colorScheme.outlineVariant,
          width: 0.5,
        ),
        children: [
          // Header row
          TableRow(
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
            ),
            children: [
              _tableCell('Field', theme, isHeader: true),
              _tableCell('Primary (keep)', theme, isHeader: true),
              _tableCell('Secondary (merge)', theme, isHeader: true),
            ],
          ),
          // Data rows
          for (final field in fields)
            TableRow(
              decoration: field.primaryValue != field.secondaryValue
                  ? BoxDecoration(
                      color: theme.colorScheme.errorContainer.withValues(alpha: 0.15),
                    )
                  : null,
              children: [
                _tableCell(field.label, theme),
                _tableCell(
                  field.primaryValue.isEmpty ? '—' : field.primaryValue,
                  theme,
                  highlight: field.primaryValue != field.secondaryValue,
                ),
                _tableCell(
                  field.secondaryValue.isEmpty ? '—' : field.secondaryValue,
                  theme,
                  highlight: field.primaryValue != field.secondaryValue,
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _tableCell(String text, ThemeData theme, {bool isHeader = false, bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Text(
        text,
        style: isHeader
            ? theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)
            : theme.textTheme.bodySmall?.copyWith(
                fontWeight: highlight ? FontWeight.w600 : null,
              ),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _buildMigrationSummary(ThemeData theme) {
    final preview = _preview!;
    final migrations = <_MigrationItem>[
      if (preview.leadsToMigrate > 0)
        _MigrationItem(Icons.trending_up, 'Leads', preview.leadsToMigrate),
      if (preview.invoicesToMigrate > 0)
        _MigrationItem(Icons.receipt_long, 'Invoices', preview.invoicesToMigrate),
      if (preview.paymentsToMigrate > 0)
        _MigrationItem(Icons.payment, 'Payments', preview.paymentsToMigrate),
      if (preview.messagesToMigrate > 0)
        _MigrationItem(Icons.message, 'Messages', preview.messagesToMigrate),
    ];

    return AppSectionCard(
      title: 'Records to Migrate',
      child: migrations.isEmpty
          ? Text(
              'No related records to migrate.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            )
          : Wrap(
              spacing: AppTheme.spacingMd,
              runSpacing: AppTheme.spacingSm,
              children: migrations.map((m) {
                return Chip(
                  avatar: Icon(m.icon, size: 18),
                  label: Text('${m.count} ${m.label}'),
                );
              }).toList(),
            ),
    );
  }

  Widget _buildMergeAction(ThemeData theme) {
    return Card(
      color: theme.colorScheme.errorContainer.withValues(alpha: 0.3),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: theme.colorScheme.error),
            const SizedBox(width: AppTheme.spacingMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'This action cannot be undone',
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'The secondary contact will be soft-deleted and all related records will be migrated to the primary contact.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppTheme.spacingMd),
            FilledButton(
              onPressed: _merging ? null : _executeMerge,
              style: FilledButton.styleFrom(backgroundColor: theme.colorScheme.error),
              child: _merging
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Merge Contacts'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComparisonField {
  final String label;
  final String primaryValue;
  final String secondaryValue;

  const _ComparisonField(this.label, this.primaryValue, this.secondaryValue);
}

class _MigrationItem {
  final IconData icon;
  final String label;
  final int count;

  const _MigrationItem(this.icon, this.label, this.count);
}
