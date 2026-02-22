import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/notification_provider.dart';

class NotificationPreferencesScreen extends ConsumerStatefulWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  ConsumerState<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState extends ConsumerState<NotificationPreferencesScreen> {
  late TimeOfDay _quietHoursStart;
  late TimeOfDay _quietHoursEnd;
  String _selectedTimezone = 'UTC';

  @override
  void initState() {
    super.initState();
    _quietHoursStart = const TimeOfDay(hour: 22, minute: 0);
    _quietHoursEnd = const TimeOfDay(hour: 8, minute: 0);
    Future.microtask(() {
      ref.read(notificationPreferencesProvider.notifier).loadPreferences();
      _updateStateFromProvider();
    });
  }

  void _updateStateFromProvider() {
    final state = ref.read(notificationPreferencesProvider);
    if (state.quietHoursStart != null) {
      _quietHoursStart = state.quietHoursStart!;
    }
    if (state.quietHoursEnd != null) {
      _quietHoursEnd = state.quietHoursEnd!;
    }
    if (state.quietHoursTimezone != null) {
      _selectedTimezone = state.quietHoursTimezone!;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final prefState = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notification Preferences'),
      ),
      body: prefState.isLoading && prefState.preferences.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              child: Column(
                children: [
                  // Mute All Toggle
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Mute All Notifications',
                                  style: theme.textTheme.titleMedium,
                                ),
                                Text(
                                  'Disable all notifications temporarily',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                            Switch(
                              value: prefState.muteAll,
                              onChanged: (value) {
                                ref
                                    .read(notificationPreferencesProvider.notifier)
                                    .setMuteAll(value);
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Preferences Grid
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notification Types',
                          style: theme.textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        Card(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: _buildPreferencesGrid(theme, prefState),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Quiet Hours Section
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Quiet Hours',
                          style: theme.textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Start Time',
                                          style: theme.textTheme.labelSmall,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _quietHoursStart.format(context),
                                          style: theme.textTheme.bodyMedium,
                                        ),
                                      ],
                                    ),
                                    FilledButton.icon(
                                      onPressed: () async {
                                        final time = await showTimePicker(
                                          context: context,
                                          initialTime: _quietHoursStart,
                                        );
                                        if (time != null) {
                                          setState(() => _quietHoursStart = time);
                                        }
                                      },
                                      icon: const Icon(Icons.schedule),
                                      label: const Text('Change'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'End Time',
                                          style: theme.textTheme.labelSmall,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _quietHoursEnd.format(context),
                                          style: theme.textTheme.bodyMedium,
                                        ),
                                      ],
                                    ),
                                    FilledButton.icon(
                                      onPressed: () async {
                                        final time = await showTimePicker(
                                          context: context,
                                          initialTime: _quietHoursEnd,
                                        );
                                        if (time != null) {
                                          setState(() => _quietHoursEnd = time);
                                        }
                                      },
                                      icon: const Icon(Icons.schedule),
                                      label: const Text('Change'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                DropdownButtonFormField<String>(
                                  value: _selectedTimezone,
                                  decoration: InputDecoration(
                                    labelText: 'Timezone',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                  ),
                                  items: _timezones.map((tz) {
                                    return DropdownMenuItem(
                                      value: tz,
                                      child: Text(tz),
                                    );
                                  }).toList(),
                                  onChanged: (value) {
                                    if (value != null) {
                                      setState(() => _selectedTimezone = value);
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Save Button
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: prefState.isLoading
                                ? null
                                : () => _savePreferences(ref),
                            child: prefState.isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('Save Preferences'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildPreferencesGrid(ThemeData theme, NotificationPreferencesState state) {
    const notificationTypes = [
      ('lead_assigned', 'Lead Assigned'),
      ('status_change', 'Status Change'),
      ('follow_up_reminder', 'Follow-up Reminder'),
      ('payment_received', 'Payment Received'),
      ('task_assigned', 'Task Assigned'),
      ('birthday', 'Birthday'),
      ('invoice_overdue', 'Invoice Overdue'),
      ('announcement', 'Announcement'),
    ];

    const channels = ['push', 'in_app', 'email'];

    return DataTable(
      columnSpacing: 12,
      dataRowHeight: 56,
      headingRowHeight: 48,
      columns: [
        const DataColumn(label: Text('Type', style: TextStyle(fontWeight: FontWeight.bold))),
        for (final channel in channels)
          DataColumn(
            label: Text(
              channel == 'push'
                  ? 'Push'
                  : channel == 'in_app'
                      ? 'In-App'
                      : 'Email',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
      ],
      rows: [
        for (final (typeKey, typeLabel) in notificationTypes)
          DataRow(
            cells: [
              DataCell(Text(typeLabel)),
              for (final channel in channels)
                DataCell(
                  Checkbox(
                    value: state.preferences[typeKey]?[channel] ?? true,
                    onChanged: (value) {
                      if (value != null) {
                        ref
                            .read(notificationPreferencesProvider.notifier)
                            .setChannelPreference(typeKey, channel, value);
                      }
                    },
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Future<void> _savePreferences(WidgetRef ref) async {
    final state = ref.read(notificationPreferencesProvider);
    await ref.read(notificationPreferencesProvider.notifier).updatePreferences(
          quietHoursStart: _quietHoursStart,
          quietHoursEnd: _quietHoursEnd,
          quietHoursTimezone: _selectedTimezone,
          preferences: state.preferences,
          muteAll: state.muteAll,
        );

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Preferences saved successfully')),
      );
    }
  }
}

const _timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Australia/Sydney',
  'Australia/Melbourne',
  'India/Standard',
  'Asia/Kolkata',
];
