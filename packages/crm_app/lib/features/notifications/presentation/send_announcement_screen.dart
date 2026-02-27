import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/notification_provider.dart';

class SendAnnouncementScreen extends ConsumerStatefulWidget {
  const SendAnnouncementScreen({super.key});

  @override
  ConsumerState<SendAnnouncementScreen> createState() =>
      _SendAnnouncementScreenState();
}

class _SendAnnouncementScreenState extends ConsumerState<SendAnnouncementScreen> {
  late TextEditingController _titleController;
  late TextEditingController _bodyController;
  String _targetType = 'all_users';
  String? _selectedRole;
  final _selectedUserIds = <String>{};
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController();
    _bodyController = TextEditingController();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Send Announcement'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title Field
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                labelText: 'Announcement Title',
                hintText: 'e.g., System Maintenance',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                prefixIcon: const Icon(Icons.title),
              ),
              maxLength: 100,
            ),
            const SizedBox(height: 16),

            // Body Field
            TextField(
              controller: _bodyController,
              decoration: InputDecoration(
                labelText: 'Announcement Message',
                hintText: 'Enter your announcement message...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                prefixIcon: const Icon(Icons.message),
              ),
              maxLines: 5,
              maxLength: 500,
            ),
            const SizedBox(height: 24),

            // Target Selector
            Text(
              'Send To',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    RadioGroup<String>(
                      groupValue: _targetType,
                      onChanged: (value) {
                        setState(() {
                          _targetType = value!;
                          if (value == 'all_users') {
                            _selectedRole = null;
                            _selectedUserIds.clear();
                          } else if (value == 'by_role') {
                            _selectedUserIds.clear();
                          } else if (value == 'specific_users') {
                            _selectedRole = null;
                          }
                        });
                      },
                      child: Column(children: [
                        RadioListTile<String>(
                          title: const Text('All Users'),
                          value: 'all_users',
                        ),
                        RadioListTile<String>(
                          title: const Text('By Role'),
                          value: 'by_role',
                        ),
                        RadioListTile<String>(
                          title: const Text('Specific Users'),
                          value: 'specific_users',
                        ),
                      ]),
                    ),
                    if (_targetType == 'by_role') ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedRole,
                        decoration: InputDecoration(
                          labelText: 'Select Role',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'admin',
                            child: Text('Admin'),
                          ),
                          DropdownMenuItem(
                            value: 'sales_manager',
                            child: Text('Sales Manager'),
                          ),
                          DropdownMenuItem(
                            value: 'sales_executive',
                            child: Text('Sales Executive'),
                          ),
                          DropdownMenuItem(
                            value: 'team_lead',
                            child: Text('Team Lead'),
                          ),
                        ],
                        onChanged: (value) {
                          setState(() => _selectedRole = value);
                        },
                      ),
                    ],
                    if (_targetType == 'specific_users') ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _selectUsers,
                        icon: const Icon(Icons.people),
                        label: Text(
                          _selectedUserIds.isEmpty
                              ? 'Select Users'
                              : '${_selectedUserIds.length} user(s) selected',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Preview Section
            Text(
              'Preview',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _titleController.text.isEmpty
                          ? 'Announcement Title'
                          : _titleController.text,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _bodyController.text.isEmpty
                          ? 'Your message will appear here...'
                          : _bodyController.text,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Send Button
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _isSending ? null : _sendAnnouncement,
                    icon: _isSending
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.send),
                    label: const Text('Send Announcement'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _selectUsers() async {
    // Placeholder for user selection dialog
    // In a real implementation, this would fetch users from the API
    // and show a multi-select dialog
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('User selection coming soon')),
    );
  }

  Future<void> _sendAnnouncement() async {
    if (_titleController.text.isEmpty || _bodyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }

    if (_targetType == 'by_role' && _selectedRole == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a role')),
      );
      return;
    }

    if (_targetType == 'specific_users' && _selectedUserIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one user')),
      );
      return;
    }

    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Announcement'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Are you sure you want to send this announcement?'),
            const SizedBox(height: 16),
            Text(
              'Recipients: ${_getRecipientText()}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isSending = true);

    try {
      await ref.read(notificationRepositoryProvider).sendAnnouncement(
            title: _titleController.text,
            body: _bodyController.text,
            target: _targetType,
            targetRole: _selectedRole,
            targetUserIds: _selectedUserIds.toList(),
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Announcement sent successfully')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send announcement: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  String _getRecipientText() {
    return switch (_targetType) {
      'all_users' => 'All Users',
      'by_role' => 'Role: $_selectedRole',
      'specific_users' => '${_selectedUserIds.length} selected user(s)',
      _ => 'Unknown',
    };
  }
}
