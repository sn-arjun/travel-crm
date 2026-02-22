import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../data/lead_provider.dart';

/// Timeline tab showing lead activities in reverse-chronological order.
class LeadTimelineTab extends ConsumerStatefulWidget {
  final String leadId;

  const LeadTimelineTab({super.key, required this.leadId});

  @override
  ConsumerState<LeadTimelineTab> createState() => _LeadTimelineTabState();
}

class _LeadTimelineTabState extends ConsumerState<LeadTimelineTab> {
  int _page = 1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(leadDetailProvider(widget.leadId).notifier).loadActivities();
    });
  }

  Future<void> _loadMore() async {
    _page++;
    await ref
        .read(leadDetailProvider(widget.leadId).notifier)
        .loadActivities(page: _page);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(leadDetailProvider(widget.leadId));

    if (state.activitiesLoading && state.activities.isEmpty) {
      return const Center(child: AppLoading());
    }

    if (state.activities.isEmpty) {
      return const Center(child: Text('No activity yet'));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMd),
      itemCount: state.activities.length + 1,
      itemBuilder: (context, index) {
        if (index == state.activities.length) {
          if (state.activitiesLoading) {
            return const Padding(
              padding: EdgeInsets.all(AppTheme.spacingMd),
              child: Center(child: AppLoading()),
            );
          }
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingMd),
            child: Center(
              child: TextButton(
                onPressed: _loadMore,
                child: const Text('Load more'),
              ),
            ),
          );
        }

        final activity = state.activities[index];
        final isLast = index == state.activities.length - 1;
        return _ActivityRow(activity: activity, isLast: isLast);
      },
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final LeadActivity activity;
  final bool isLast;

  const _ActivityRow({required this.activity, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _styleFor(activity.type);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline spine
          SizedBox(
            width: 36,
            child: Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, size: 14, color: color),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: theme.dividerColor,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.spacingSm),
          // Content
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _labelFor(activity.type),
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  if (activity.content != null &&
                      activity.content!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      activity.content!,
                      style: theme.textTheme.bodySmall,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    '${activity.createdAt ?? ''}${activity.createdByName != null ? '  •  ${activity.createdByName}' : ''}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static (IconData, Color) _styleFor(String type) => switch (type) {
        'note' => (Icons.note_outlined, const Color(0xFF5C6BC0)),
        'call' => (Icons.phone_outlined, const Color(0xFF26A69A)),
        'email' => (Icons.email_outlined, const Color(0xFF42A5F5)),
        'whatsapp' => (Icons.message_outlined, const Color(0xFF66BB6A)),
        'visit' => (Icons.place_outlined, const Color(0xFFFF7043)),
        'sms' => (Icons.sms_outlined, const Color(0xFFAB47BC)),
        'status_change' => (Icons.swap_horiz, const Color(0xFFFFA726)),
        'created' => (Icons.add_circle_outline, const Color(0xFF4CAF50)),
        'assigned' => (Icons.person_add_outlined, const Color(0xFF29B6F6)),
        _ => (Icons.history, const Color(0xFF9E9E9E)),
      };

  static String _labelFor(String type) => switch (type) {
        'note' => 'Note added',
        'call' => 'Call logged',
        'email' => 'Email sent',
        'whatsapp' => 'WhatsApp sent',
        'visit' => 'Visit recorded',
        'sms' => 'SMS sent',
        'status_change' => 'Status changed',
        'created' => 'Lead created',
        'assigned' => 'Lead assigned',
        _ => type,
      };
}
