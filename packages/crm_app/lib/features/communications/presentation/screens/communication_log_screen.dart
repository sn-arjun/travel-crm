import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/data/app_data_table.dart';
import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/data/app_stat_card.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/communication_provider.dart';
import '../../data/communication_state.dart';
import '../widgets/channel_badge.dart';

class CommunicationLogScreen extends ConsumerStatefulWidget {
  const CommunicationLogScreen({super.key});

  @override
  ConsumerState<CommunicationLogScreen> createState() =>
      _CommunicationLogScreenState();
}

class _CommunicationLogScreenState
    extends ConsumerState<CommunicationLogScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  bool _isSearchOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(communicationLogProvider.notifier).loadLog(refresh: true);
    });
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 200) {
      ref.read(communicationLogProvider.notifier).loadNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(communicationLogProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: _isSearchOpen
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search by contact...',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  fillColor: Colors.transparent,
                  filled: true,
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 0,
                    vertical: 10,
                  ),
                ),
                onChanged: (value) {
                  ref.read(communicationLogProvider.notifier).setSearch(
                        value.trim(),
                      );
                },
              )
            : const Text('Communications'),
        actions: [
          IconButton(
            icon: Icon(_isSearchOpen ? Icons.close : Icons.search_rounded),
            tooltip: _isSearchOpen ? 'Close search' : 'Search',
            onPressed: () {
              setState(() {
                _isSearchOpen = !_isSearchOpen;
                if (!_isSearchOpen) {
                  _searchController.clear();
                  ref.read(communicationLogProvider.notifier).setSearch('');
                }
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Summary cards
          if (state.messages.isNotEmpty) _buildSummaryCards(context, state),

          // Channel filter bar
          AppFilterBar(
            filters: [
              ('All', null),
              ('WhatsApp', 'whatsapp'),
              ('SMS', 'sms'),
              ('Email', 'email'),
            ],
            selectedFilter: state.channelFilter,
            onFilterChanged: (value) {
              ref.read(communicationLogProvider.notifier).setChannelFilter(value);
            },
            onClear: () {
              ref.read(communicationLogProvider.notifier).clearFilters();
            },
          ),

          const Divider(height: 1),

          // Body
          Expanded(
            child: _buildBody(context, state, theme),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCards(BuildContext context, state) {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      child: Row(
        children: [
          Expanded(
            child: AppStatCard(
              title: 'Today',
              value: '${state.messages.length}',
              icon: Icons.message_rounded,
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          Expanded(
            child: AppStatCard(
              title: 'This Week',
              value: '${state.totalMessages}',
              icon: Icons.calendar_today_rounded,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context, state, ThemeData theme) {
    if (state.status == CommunicationStatus.loading &&
        state.messages.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.status == CommunicationStatus.error) {
      return Center(
        child: AppErrorWidget(
          message: state.error ?? 'Failed to load communications',
          onRetry: () {
            ref.read(communicationLogProvider.notifier).loadLog(refresh: true);
          },
        ),
      );
    }

    if (state.messages.isEmpty) {
      return const Center(
        child: AppEmptyState(
          title: 'No communications',
          description: 'Communications will appear here as you send messages',
          icon: Icons.mail_outline_rounded,
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      itemCount: state.messages.length +
          (state.status == CommunicationStatus.loading ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == state.messages.length &&
            state.status == CommunicationStatus.loading) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(AppTheme.spacingMd),
              child: AppLoading(),
            ),
          );
        }

        final message = state.messages[index];
        return _buildMessageRow(context, message, theme);
      },
    );
  }

  Widget _buildMessageRow(
    BuildContext context,
    Map<String, dynamic> message,
    ThemeData theme,
  ) {
    final channel = message['channel'] ?? 'unknown';
    final isOutgoing = message['direction'] == 'outgoing';
    final timestamp = DateTime.tryParse(message['createdAt'] ?? '');

    return ListTile(
      onTap: () {
        context.push(
          '/communications/${message['contactId']}',
          extra: message['contactName'],
        );
      },
      leading: ChannelBadge(
        channel: channel,
        small: true,
      ),
      title: Text(message['contactName'] ?? 'Unknown'),
      subtitle: Text(
        message['message'] ?? '',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (timestamp != null)
            Text(
              DateFormat('HH:mm').format(timestamp),
              style: theme.textTheme.labelSmall,
            ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            decoration: BoxDecoration(
              color: isOutgoing
                  ? Colors.blue.withOpacity(0.2)
                  : Colors.green.withOpacity(0.2),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              isOutgoing ? 'Out' : 'In',
              style: theme.textTheme.labelSmall?.copyWith(
                fontSize: 10,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
