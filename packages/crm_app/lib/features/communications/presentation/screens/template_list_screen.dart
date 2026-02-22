import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../data/communication_provider.dart';
import '../../data/communication_state.dart';
import '../widgets/channel_badge.dart';

class TemplateListScreen extends ConsumerStatefulWidget {
  const TemplateListScreen({super.key});

  @override
  ConsumerState<TemplateListScreen> createState() => _TemplateListScreenState();
}

class _TemplateListScreenState extends ConsumerState<TemplateListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late TextEditingController _searchController;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _searchController = TextEditingController();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(templateListProvider.notifier).loadTemplates(refresh: true);
    });

    _tabController.addListener(_onTabChanged);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _tabController
      ..removeListener(_onTabChanged)
      ..dispose();
    _searchController.dispose();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onTabChanged() {
    final channels = ['', 'whatsapp', 'sms', 'email'];
    final channel = channels[_tabController.index];
    ref.read(templateListProvider.notifier).setChannelFilter(
          channel.isEmpty ? null : channel,
        );
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 200) {
      ref.read(templateListProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(templateListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Message Templates'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'All'),
            Tab(text: 'WhatsApp'),
            Tab(text: 'SMS'),
            Tab(text: 'Email'),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMd),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search templates...',
                prefixIcon: const Icon(Icons.search_rounded),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
              onChanged: (value) {
                ref.read(templateListProvider.notifier).setSearch(
                      value.trim(),
                    );
              },
            ),
          ),
          // Templates list
          Expanded(
            child: _buildBody(context, state),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/templates/new'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Template'),
      ),
    );
  }

  Widget _buildBody(BuildContext context, state) {
    if (state.status == CommunicationStatus.loading &&
        state.templates.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.status == CommunicationStatus.error) {
      return Center(
        child: AppErrorWidget(
          message: state.error ?? 'Failed to load templates',
          onRetry: () {
            ref.read(templateListProvider.notifier).loadTemplates(
                  refresh: true,
                );
          },
        ),
      );
    }

    if (state.templates.isEmpty) {
      return const Center(
        child: AppEmptyState(
          title: 'No templates',
          description: 'Create a template to quickly send messages',
          icon: Icons.template_banner_rounded,
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      itemCount: state.templates.length +
          (state.status == CommunicationStatus.loading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == state.templates.length &&
            state.status == CommunicationStatus.loading) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(AppTheme.spacingMd),
              child: AppLoading(),
            ),
          );
        }

        final template = state.templates[index];
        return _buildTemplateCard(context, template);
      },
    );
  }

  Widget _buildTemplateCard(
    BuildContext context,
    Map<String, dynamic> template,
  ) {
    return Card(
      margin: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMd,
        vertical: AppTheme.spacingSm,
      ),
      child: ListTile(
        onTap: () => context.push(
          '/templates/${template['id']}/edit',
          extra: template,
        ),
        leading: ChannelBadge(
          channel: template['channel'] ?? 'unknown',
          small: true,
        ),
        title: Text(template['name'] ?? 'Untitled'),
        subtitle: Text(
          template['body'] ?? '',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: PopupMenuButton(
          itemBuilder: (context) => [
            PopupMenuItem(
              child: const Row(
                children: [
                  Icon(Icons.edit_rounded),
                  SizedBox(width: 8),
                  Text('Edit'),
                ],
              ),
              onTap: () => context.push(
                '/templates/${template['id']}/edit',
                extra: template,
              ),
            ),
            PopupMenuItem(
              child: const Row(
                children: [
                  Icon(Icons.delete_outline_rounded),
                  SizedBox(width: 8),
                  Text('Delete'),
                ],
              ),
              onTap: () {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Delete Template?'),
                    content: const Text(
                      'This action cannot be undone.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () {
                          ref
                              .read(templateListProvider.notifier)
                              .deleteTemplate(template['id']);
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Template deleted'),
                            ),
                          );
                        },
                        child: const Text('Delete'),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
