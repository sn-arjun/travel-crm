import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/data/app_empty_state.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/voip_repository.dart';

/// TICKET-390: Multi-Number Management

final _numbersProvider =
    FutureProvider.autoDispose<List<TwilioNumberModel>>((ref) async {
  return ref.read(voipRepositoryProvider).getNumbers();
});

class NumberManagementScreen extends ConsumerStatefulWidget {
  const NumberManagementScreen({super.key});

  @override
  ConsumerState<NumberManagementScreen> createState() =>
      _NumberManagementScreenState();
}

class _NumberManagementScreenState
    extends ConsumerState<NumberManagementScreen> {
  bool _searching = false;

  Future<void> _showSearchDialog() async {
    final countryCtrl = TextEditingController(text: 'US');
    final areaCtrl = TextEditingController();
    final containsCtrl = TextEditingController();

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Search Phone Numbers'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: countryCtrl,
              decoration: const InputDecoration(
                labelText: 'Country Code',
                hintText: 'US, IN, GB',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: areaCtrl,
              decoration: const InputDecoration(
                labelText: 'Area Code (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: containsCtrl,
              decoration: const InputDecoration(
                labelText: 'Contains (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              _searchNumbers(
                country: countryCtrl.text.trim(),
                areaCode: areaCtrl.text.trim(),
                contains: containsCtrl.text.trim(),
              );
            },
            child: const Text('Search'),
          ),
        ],
      ),
    );
  }

  Future<void> _searchNumbers({
    String? country,
    String? areaCode,
    String? contains,
  }) async {
    setState(() => _searching = true);
    try {
      final numbers = await ref.read(voipRepositoryProvider).searchNumbers(
            country: country,
            areaCode: areaCode,
            contains: contains,
          );

      if (!mounted) return;
      _showAvailableNumbers(numbers);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, e.toString());
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _showAvailableNumbers(List<AvailableNumber> numbers) {
    if (numbers.isEmpty) {
      AppSnackbar.error(context, 'No numbers found');
      return;
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Available Numbers (${numbers.length})'),
        content: SizedBox(
          width: 400,
          height: 400,
          child: ListView.builder(
            itemCount: numbers.length,
            itemBuilder: (_, i) {
              final n = numbers[i];
              return ListTile(
                title: Text(n.phoneNumber),
                subtitle: Text([
                  if (n.locality != null) n.locality!,
                  if (n.region != null) n.region!,
                ].join(', ')),
                trailing: FilledButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _purchaseNumber(n.phoneNumber, n.friendlyName);
                  },
                  child: const Text('Buy'),
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _purchaseNumber(String phoneNumber, String? friendlyName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Purchase'),
        content: Text(
            'Purchase $phoneNumber? This will charge your Twilio account.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Purchase'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(voipRepositoryProvider).purchaseNumber(
            phoneNumber: phoneNumber,
            friendlyName: friendlyName,
          );
      ref.invalidate(_numbersProvider);
      if (mounted) AppSnackbar.success(context, 'Number purchased');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, e.toString());
    }
  }

  Future<void> _setDefault(TwilioNumberModel number) async {
    try {
      await ref
          .read(voipRepositoryProvider)
          .updateNumber(number.id, {'isDefault': true});
      ref.invalidate(_numbersProvider);
      if (mounted) AppSnackbar.success(context, 'Default number updated');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, e.toString());
    }
  }

  Future<void> _deleteNumber(TwilioNumberModel number) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Release Number'),
        content: Text(
            'Release ${number.phoneNumber}? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Release'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(voipRepositoryProvider).deleteNumber(number.id);
      ref.invalidate(_numbersProvider);
      if (mounted) AppSnackbar.success(context, 'Number released');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final asyncNumbers = ref.watch(_numbersProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Phone Numbers',
                    style: theme.textTheme.headlineSmall),
              ),
              if (_searching)
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _searching ? null : _showSearchDialog,
                icon: const Icon(Icons.add),
                label: const Text('Add Number'),
              ),
            ],
          ),
          const SizedBox(height: 24),

          asyncNumbers.when(
            loading: () => const AppLoading(),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (numbers) {
              if (numbers.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.phone_outlined,
                  title: 'No Phone Numbers',
                  subtitle: 'Add a phone number to start making calls',
                );
              }

              return AppSectionCard(
                title: 'Active Numbers',
                child: Column(
                  children: numbers.map((n) {
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: n.isDefault
                            ? theme.colorScheme.primaryContainer
                            : theme.colorScheme.surfaceContainerHighest,
                        child: Icon(
                          Icons.phone,
                          color: n.isDefault
                              ? theme.colorScheme.primary
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      title: Row(
                        children: [
                          Text(n.phoneNumber),
                          if (n.isDefault) ...[
                            const SizedBox(width: 8),
                            Chip(
                              label: const Text('Default'),
                              labelStyle: theme.textTheme.labelSmall,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                        ],
                      ),
                      subtitle: Text([
                        if (n.friendlyName != null) n.friendlyName!,
                        if (n.assignedName != null)
                          'Assigned to ${n.assignedName}',
                        n.purpose,
                      ].join(' • ')),
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) {
                          switch (action) {
                            case 'default':
                              _setDefault(n);
                            case 'delete':
                              _deleteNumber(n);
                          }
                        },
                        itemBuilder: (_) => [
                          if (!n.isDefault)
                            const PopupMenuItem(
                              value: 'default',
                              child: Text('Set as Default'),
                            ),
                          const PopupMenuItem(
                            value: 'delete',
                            child: Text('Release Number'),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
