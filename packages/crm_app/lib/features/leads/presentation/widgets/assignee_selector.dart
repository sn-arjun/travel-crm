import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../features/auth/data/auth_provider.dart';

/// Provider that fetches a list of assignable users (salesperson + manager + admin).
final _assignableUsersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiClientProvider);
  final response = await api.get(
    ApiEndpoints.users,
    queryParameters: {
      'role': 'salesperson,sales_manager,admin',
      'isActive': '1',
      'pageSize': '100',
    },
  );
  final data = response.data['data'] as Map<String, dynamic>?;
  final list = (data?['items'] ?? response.data['data']) as List? ?? [];
  return list.cast<Map<String, dynamic>>();
});

/// A [DropdownButtonFormField] for selecting a lead assignee.
class AssigneeSelector extends ConsumerWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  final bool required;

  const AssigneeSelector({
    super.key,
    required this.value,
    required this.onChanged,
    this.required = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(_assignableUsersProvider);

    return usersAsync.when(
      loading: () => const LinearProgressIndicator(),
      error: (_, _) => const Text('Failed to load users'),
      data: (users) => DropdownButtonFormField<String>(
        initialValue: value,
        decoration: InputDecoration(
          labelText: required ? 'Assignee *' : 'Assignee',
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.person_outline),
        ),
        hint: const Text('Unassigned'),
        items: [
          const DropdownMenuItem<String>(
            value: null,
            child: Text('Unassigned'),
          ),
          ...users.map(
            (u) => DropdownMenuItem<String>(
              value: u['id'] as String?,
              child: Text(u['name'] as String? ?? ''),
            ),
          ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}
