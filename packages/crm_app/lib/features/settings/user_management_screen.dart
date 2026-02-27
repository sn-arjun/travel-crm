import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../app/theme.dart';
import '../../core/widgets/feedback/app_loading.dart';
import '../../core/widgets/feedback/app_snackbar.dart';
import '../auth/data/auth_provider.dart';

// ── Providers ─────────────────────────────────────────────

final userListProvider = FutureProvider.autoDispose<List<UserModel>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(ApiEndpoints.users);
  final list = response.data['data'] as List;
  return list.map((e) => UserModel.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────

class UserManagementScreen extends ConsumerStatefulWidget {
  const UserManagementScreen({super.key});

  @override
  ConsumerState<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends ConsumerState<UserManagementScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(userListProvider);
    final theme = Theme.of(context);
    final currentUser = ref.watch(authProvider).user;
    final isAdmin = currentUser?.role == 'admin';

    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Team Members', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    Text('Manage your team and roles', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              if (isAdmin)
                FilledButton.icon(
                  onPressed: () => _showInviteDialog(context, ref),
                  icon: const Icon(Icons.person_add_rounded, size: 18),
                  label: const Text('Invite User'),
                ),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMd),
          // Search bar
          SizedBox(
            width: 360,
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by name or email...',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close_rounded, size: 18),
                        onPressed: () => setState(() => _searchQuery = ''),
                      )
                    : null,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              onChanged: (v) => setState(() => _searchQuery = v.toLowerCase()),
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Expanded(
            child: async.when(
              loading: () => const AppLoading(message: 'Loading team...'),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (users) {
                final filtered = _searchQuery.isEmpty
                    ? users
                    : users.where((u) =>
                        u.name.toLowerCase().contains(_searchQuery) ||
                        u.email.toLowerCase().contains(_searchQuery)).toList();
                return filtered.isEmpty
                    ? _EmptyState(hasSearch: _searchQuery.isNotEmpty)
                    : ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: AppTheme.spacingSm),
                        itemBuilder: (context, i) => _UserCard(
                          user: filtered[i],
                          isAdmin: isAdmin,
                          isSelf: filtered[i].id == currentUser?.id,
                          onEdit: isAdmin ? () => _showEditDialog(context, ref, filtered[i]) : null,
                          onToggleActive: isAdmin && filtered[i].id != currentUser?.id
                              ? () => _confirmToggleActive(context, ref, filtered[i])
                              : null,
                        ),
                      );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmToggleActive(BuildContext context, WidgetRef ref, UserModel user) async {
    final action = user.isActive ? 'Deactivate' : 'Activate';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('$action ${user.name}?'),
        content: Text(user.isActive
            ? 'This user will no longer be able to access the system.'
            : 'This will restore access for ${user.name}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: user.isActive
                ? FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error)
                : null,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final api = ref.read(apiClientProvider);
      final endpoint = user.isActive ? ApiEndpoints.userDeactivate(user.id) : ApiEndpoints.userActivate(user.id);
      await api.put(endpoint);
      ref.invalidate(userListProvider);
      if (context.mounted) {
        AppSnackbar.success(context, '${user.name} ${user.isActive ? 'deactivated' : 'activated'}');
      }
    } catch (e) {
      if (context.mounted) AppSnackbar.error(context, 'Failed to update user');
    }
  }

  void _showInviteDialog(BuildContext context, WidgetRef ref) {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String selectedRole = 'salesperson';
    String selectedDepartment = '';

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Invite Team Member'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Full Name')),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email')),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Phone (optional)')),
                const SizedBox(height: AppTheme.spacingMd),
                DropdownButtonFormField<String>(
                  initialValue: selectedRole,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: _roleItems,
                  onChanged: (v) => setDialogState(() => selectedRole = v ?? selectedRole),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                DropdownButtonFormField<String>(
                  initialValue: selectedDepartment,
                  decoration: const InputDecoration(labelText: 'Department (optional)'),
                  items: _departmentItems,
                  onChanged: (v) => setDialogState(() => selectedDepartment = v ?? ''),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty || emailCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                try {
                  final api = ref.read(apiClientProvider);
                  await api.post(ApiEndpoints.users, data: {
                    'name': nameCtrl.text.trim(),
                    'email': emailCtrl.text.trim(),
                    'role': selectedRole,
                    if (phoneCtrl.text.trim().isNotEmpty) 'phone': phoneCtrl.text.trim(),
                    if (selectedDepartment.isNotEmpty) 'department': selectedDepartment,
                  });
                  ref.invalidate(userListProvider);
                  if (context.mounted) AppSnackbar.success(context, 'Invitation sent to ${emailCtrl.text.trim()}');
                } catch (e) {
                  if (context.mounted) AppSnackbar.error(context, e is ApiException ? e.message : 'Failed to invite user');
                }
              },
              child: const Text('Send Invite'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditDialog(BuildContext context, WidgetRef ref, UserModel user) {
    final nameCtrl = TextEditingController(text: user.name);
    final phoneCtrl = TextEditingController(text: user.phone ?? '');
    String selectedRole = user.role;
    String selectedDepartment = user.department ?? '';

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Edit ${user.name}'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Full Name')),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(
                  enabled: false,
                  decoration: InputDecoration(labelText: 'Email', hintText: user.email),
                  controller: TextEditingController(text: user.email),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: AppTheme.spacingMd),
                DropdownButtonFormField<String>(
                  initialValue: selectedRole,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: _roleItems,
                  onChanged: (v) => setDialogState(() => selectedRole = v ?? selectedRole),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                DropdownButtonFormField<String>(
                  initialValue: _departmentItems.any((d) => d.value == selectedDepartment) ? selectedDepartment : '',
                  decoration: const InputDecoration(labelText: 'Department'),
                  items: _departmentItems,
                  onChanged: (v) => setDialogState(() => selectedDepartment = v ?? ''),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                try {
                  final api = ref.read(apiClientProvider);
                  await api.put(ApiEndpoints.user(user.id), data: {
                    'name': nameCtrl.text.trim(),
                    'role': selectedRole,
                    if (phoneCtrl.text.trim().isNotEmpty) 'phone': phoneCtrl.text.trim(),
                    if (selectedDepartment.isNotEmpty) 'department': selectedDepartment,
                  });
                  ref.invalidate(userListProvider);
                  if (context.mounted) AppSnackbar.success(context, '${nameCtrl.text.trim()} updated');
                } catch (e) {
                  if (context.mounted) AppSnackbar.error(context, e is ApiException ? e.message : 'Failed to update user');
                }
              },
              child: const Text('Save Changes'),
            ),
          ],
        ),
      ),
    );
  }

  static const _roleItems = [
    DropdownMenuItem(value: 'admin', child: Text('Admin')),
    DropdownMenuItem(value: 'sales_manager', child: Text('Sales Manager')),
    DropdownMenuItem(value: 'salesperson', child: Text('Salesperson')),
    DropdownMenuItem(value: 'operations', child: Text('Operations')),
    DropdownMenuItem(value: 'accountant', child: Text('Accountant')),
    DropdownMenuItem(value: 'view_only', child: Text('View Only')),
  ];

  static const _departmentItems = [
    DropdownMenuItem(value: '', child: Text('None')),
    DropdownMenuItem(value: 'sales', child: Text('Sales')),
    DropdownMenuItem(value: 'marketing', child: Text('Marketing')),
    DropdownMenuItem(value: 'operations', child: Text('Operations')),
    DropdownMenuItem(value: 'finance', child: Text('Finance')),
    DropdownMenuItem(value: 'hr', child: Text('Human Resources')),
    DropdownMenuItem(value: 'support', child: Text('Customer Support')),
    DropdownMenuItem(value: 'management', child: Text('Management')),
  ];
}

// ── User Card ─────────────────────────────────────────────

class _UserCard extends StatelessWidget {
  final UserModel user;
  final bool isAdmin;
  final bool isSelf;
  final VoidCallback? onEdit;
  final VoidCallback? onToggleActive;
  const _UserCard({required this.user, required this.isAdmin, required this.isSelf, this.onEdit, this.onToggleActive});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final (Color roleBg, Color roleFg) = switch (user.role) {
      'admin' => (const Color(0xFFFEF2F2), const Color(0xFFDC2626)),
      'sales_manager' => (const Color(0xFFF0F9FF), const Color(0xFF2563EB)),
      'salesperson' => (const Color(0xFFF0FDF4), const Color(0xFF16A34A)),
      'operations' => (const Color(0xFFFFF7ED), const Color(0xFFEA580C)),
      'accountant' => (const Color(0xFFF5F3FF), const Color(0xFF7C3AED)),
      _ => (const Color(0xFFF8FAFC), const Color(0xFF64748B)),
    };

    final roleLabel = user.role.replaceAll('_', ' ').split(' ').map((w) => '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

    return InkWell(
      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      onTap: onEdit,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              // Avatar with status dot
              Stack(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primaryColor, AppTheme.primaryLight],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    ),
                    child: Center(
                      child: Text(
                        user.name[0].toUpperCase(),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
                      ),
                    ),
                  ),
                  // Status dot
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: user.inviteStatus == 'pending'
                            ? const Color(0xFFF59E0B)
                            : user.isActive
                                ? const Color(0xFF22C55E)
                                : const Color(0xFF9CA3AF),
                        shape: BoxShape.circle,
                        border: Border.all(color: theme.colorScheme.surface, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: AppTheme.spacingMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            user.name,
                            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isSelf) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                            child: const Text('You', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.primaryColor)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(user.email, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                    if (user.lastLoginAt != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Last login: ${_formatDate(user.lastLoginAt!)}',
                        style: theme.textTheme.bodySmall?.copyWith(fontSize: 11, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.7)),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(color: roleBg, borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                child: Text(roleLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: roleFg)),
              ),
              const SizedBox(width: AppTheme.spacingSm),
              if (user.inviteStatus == 'pending')
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFFFFF7ED), borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                  child: const Text('Pending Invite', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFFEA580C))),
                )
              else if (!user.isActive)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
                  child: const Text('Inactive', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFFDC2626))),
                ),
              if (isAdmin && !isSelf) ...[
                const SizedBox(width: 4),
                PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'edit') onEdit?.call();
                    if (v == 'toggle') onToggleActive?.call();
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(Icons.edit_outlined, size: 18),
                          SizedBox(width: 8),
                          Text('Edit'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'toggle',
                      child: Row(
                        children: [
                          Icon(user.isActive ? Icons.block_rounded : Icons.check_circle_outline_rounded, size: 18),
                          const SizedBox(width: 8),
                          Text(user.isActive ? 'Deactivate' : 'Activate'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Empty State ───────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final bool hasSearch;
  const _EmptyState({this.hasSearch = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(AppTheme.radiusXl)),
            child: Icon(hasSearch ? Icons.search_off_rounded : Icons.group_outlined, size: 40, color: const Color(0xFF94A3B8)),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text(
            hasSearch ? 'No matching team members' : 'No team members yet',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            hasSearch ? 'Try a different search term' : 'Invite your team to start collaborating',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
