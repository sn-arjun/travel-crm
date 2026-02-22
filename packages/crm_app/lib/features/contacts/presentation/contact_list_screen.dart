import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../app/theme.dart';
import '../../../core/widgets/data/app_data_table.dart';
import '../../../core/widgets/data/app_empty_state.dart';
import '../../../core/widgets/feedback/app_loading.dart';
import '../../../core/widgets/feedback/app_error_widget.dart';
import '../../../core/widgets/feedback/app_snackbar.dart';
import '../../../core/widgets/forms/app_search_field.dart';
import '../../../core/widgets/layout/app_filter_bar.dart';
import '../../../core/widgets/layout/app_responsive_builder.dart';
import '../data/contact_provider.dart';
import '../data/contact_state.dart';
import 'widgets/contact_type_badge.dart';
import 'widgets/source_badge.dart';
import 'widgets/tag_chips.dart';

class ContactListScreen extends ConsumerStatefulWidget {
  const ContactListScreen({super.key});

  @override
  ConsumerState<ContactListScreen> createState() => _ContactListScreenState();
}

class _ContactListScreenState extends ConsumerState<ContactListScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(contactListProvider.notifier).loadContacts());
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(contactListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(contactListProvider);
    final notifier = ref.read(contactListProvider.notifier);
    final filterOptions = ref.watch(contactFilterOptionsProvider);

    return Column(
      children: [
        // Search + actions bar
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppTheme.spacingMd, AppTheme.spacingMd, AppTheme.spacingMd, 0,
          ),
          child: Row(
            children: [
              Expanded(
                child: AppSearchField(
                  hint: 'Search contacts...',
                  onChanged: notifier.setSearch,
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              if (state.selectedIds.isNotEmpty) ...[
                _BulkActions(
                  selectedCount: state.selectedIds.length,
                  onClearSelection: notifier.clearSelection,
                  onBulkTag: () => _showBulkTagDialog(context),
                ),
                const SizedBox(width: AppTheme.spacingSm),
              ],
              IconButton(
                icon: const Icon(Icons.upload_file_outlined),
                tooltip: 'Import',
                onPressed: () => context.go('/contacts/import'),
              ),
              FilledButton.icon(
                onPressed: () => context.go('/contacts/new'),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add Contact'),
              ),
            ],
          ),
        ),

        // Filter bar
        filterOptions.when(
          data: (options) => AppFilterBar<String>(
            filters: options.types
                .map((t) => FilterItem(label: _capitalize(t), value: t))
                .toList(),
            selectedValue: state.typeFilter,
            onFilterChanged: notifier.setTypeFilter,
          ),
          loading: () => const SizedBox(height: 48),
          error: (_, _) => const SizedBox(height: 48),
        ),

        // Content
        Expanded(
          child: _buildContent(context, state, notifier),
        ),
      ],
    );
  }

  Widget _buildContent(
    BuildContext context,
    ContactListState state,
    ContactListNotifier notifier,
  ) {
    if (state.status == ContactListStatus.initial ||
        (state.status == ContactListStatus.loading && state.contacts.isEmpty)) {
      return const AppLoading();
    }

    if (state.status == ContactListStatus.error && state.contacts.isEmpty) {
      return AppErrorWidget(
        message: state.error ?? 'Failed to load contacts',
        onRetry: () => notifier.loadContacts(refresh: true),
      );
    }

    if (state.contacts.isEmpty) {
      return AppEmptyState(
        icon: Icons.contacts_outlined,
        title: 'No contacts yet',
        subtitle: 'Create your first contact or import from a CSV file',
        actionLabel: 'Add Contact',
        onAction: () => context.go('/contacts/new'),
      );
    }

    return AppResponsiveBuilder(
      desktop: _buildDesktopTable(context, state, notifier),
      mobile: _buildMobileList(context, state, notifier),
    );
  }

  Widget _buildDesktopTable(
    BuildContext context,
    ContactListState state,
    ContactListNotifier notifier,
  ) {
    return AppDataTable<ContactModel>(
      columns: [
        AppDataColumn(title: 'Name', field: 'name', sortable: true, width: 200),
        AppDataColumn(title: 'Email', field: 'email', sortable: true),
        AppDataColumn(title: 'Phone', field: 'phone'),
        AppDataColumn(title: 'Company', field: 'company', sortable: true),
        AppDataColumn(
          title: 'Type',
          field: 'type',
          cellBuilder: (value) => ContactTypeBadge(type: value ?? ''),
        ),
        AppDataColumn(
          title: 'Source',
          field: 'source',
          cellBuilder: (value) => SourceBadge(source: value),
        ),
        AppDataColumn(title: 'City', field: 'city', sortable: true),
        AppDataColumn(
          title: 'Tags',
          field: 'tags',
          width: 200,
          cellBuilder: (value) {
            final tags = (value as List<dynamic>?)?.cast<String>() ?? [];
            return TagChips(tags: tags, maxVisible: 2);
          },
        ),
      ],
      rows: state.contacts,
      rowValueFor: (contact, field) => switch (field) {
        'name' => contact.name,
        'email' => contact.email,
        'phone' => contact.phone,
        'company' => contact.company,
        'type' => contact.type,
        'source' => contact.source,
        'city' => contact.city,
        'tags' => contact.tags,
        _ => '',
      },
      selectable: true,
      selectedIndices: state.contacts
          .asMap()
          .entries
          .where((e) => state.selectedIds.contains(e.value.id))
          .map((e) => e.key)
          .toSet(),
      onSelectionChanged: (indices) {
        final ids = indices.map((i) => state.contacts[i].id).toSet();
        notifier.clearSelection();
        for (final id in ids) {
          notifier.toggleSelection(id);
        }
      },
      onRowTap: (i) => context.go('/contacts/${state.contacts[i].id}'),
      sortState: SortState(
        field: state.sortBy,
        ascending: state.sortOrder == 'asc',
      ),
      onSort: (sort) => notifier.setSort(
        sort.field,
        sort.ascending ? 'asc' : 'desc',
      ),
      pagination: state.pagination != null
          ? PaginationState(
              page: state.pagination!.page,
              pageSize: state.pagination!.limit,
              total: state.pagination!.total,
            )
          : null,
      onPageChanged: (page) {
        // Reload for that page
        notifier.loadContacts(refresh: true);
      },
    );
  }

  Widget _buildMobileList(
    BuildContext context,
    ContactListState state,
    ContactListNotifier notifier,
  ) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: state.contacts.length + (state.hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= state.contacts.length) {
          return const Padding(
            padding: EdgeInsets.all(AppTheme.spacingMd),
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final contact = state.contacts[index];
        return _ContactCard(
          contact: contact,
          isSelected: state.selectedIds.contains(contact.id),
          onTap: () => context.go('/contacts/${contact.id}'),
          onLongPress: () => notifier.toggleSelection(contact.id),
        );
      },
    );
  }

  void _showBulkTagDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Tag to Selected'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Tag name',
            hintText: 'Enter tag name',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                ref.read(contactListProvider.notifier).bulkTag(
                      tags: [controller.text.trim()],
                      action: 'add',
                    );
                Navigator.pop(ctx);
                AppSnackbar.success(context, 'Tags updated');
              }
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

class _BulkActions extends StatelessWidget {
  final int selectedCount;
  final VoidCallback onClearSelection;
  final VoidCallback onBulkTag;

  const _BulkActions({
    required this.selectedCount,
    required this.onClearSelection,
    required this.onBulkTag,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$selectedCount selected',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onPrimaryContainer,
              )),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.label_outline, size: 18),
            tooltip: 'Bulk tag',
            onPressed: onBulkTag,
            visualDensity: VisualDensity.compact,
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            tooltip: 'Clear selection',
            onPressed: onClearSelection,
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  final ContactModel contact;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ContactCard({
    required this.contact,
    required this.isSelected,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingSm),
      color: isSelected ? theme.colorScheme.primaryContainer.withValues(alpha: 0.3) : null,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacingMd),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                child: Text(
                  contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: AppTheme.spacingMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            contact.name,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ContactTypeBadge(type: contact.type),
                      ],
                    ),
                    if (contact.company != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        contact.company!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (contact.email != null) ...[
                          Icon(Icons.email_outlined,
                              size: 13, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              contact.email!,
                              style: theme.textTheme.bodySmall,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                        if (contact.phone != null) ...[
                          const SizedBox(width: 12),
                          Icon(Icons.phone_outlined,
                              size: 13, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(contact.phone!, style: theme.textTheme.bodySmall),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
