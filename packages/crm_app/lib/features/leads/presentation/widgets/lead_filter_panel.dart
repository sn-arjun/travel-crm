import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../app/theme.dart';
import '../../data/lead_provider.dart';

/// Bottom-sheet filter panel for leads list/pipeline.
///
/// Shows: status checkboxes, priority chips, assignee dropdown,
/// source dropdown, trip type dropdown.
class LeadFilterPanel extends ConsumerStatefulWidget {
  const LeadFilterPanel({super.key});

  @override
  ConsumerState<LeadFilterPanel> createState() => _LeadFilterPanelState();
}

class _LeadFilterPanelState extends ConsumerState<LeadFilterPanel> {
  // Local state mirrors the current provider state until "Apply"
  String? _status;
  String? _priority;
  String? _source;
  String? _tripType;

  static const _statuses = [
    ('new', 'New'),
    ('contacted', 'Contacted'),
    ('requirement_gathered', 'Requirement Gathered'),
    ('proposal_sent', 'Proposal Sent'),
    ('negotiation', 'Negotiation'),
    ('booking_confirmed', 'Booking Confirmed'),
    ('completed', 'Completed'),
    ('lost', 'Lost'),
  ];
  static const _priorities = ['hot', 'warm', 'cold'];
  static const _sources = [
    ('manual', 'Manual'),
    ('website', 'Website'),
    ('facebook', 'Facebook'),
    ('google', 'Google'),
    ('referral', 'Referral'),
    ('walkin', 'Walk-in'),
  ];
  static const _tripTypes = [
    'domestic', 'international', 'honeymoon', 'family',
    'group', 'corporate', 'adventure', 'pilgrimage',
  ];

  @override
  void initState() {
    super.initState();
    final s = ref.read(leadListProvider);
    _status = s.statusFilter;
    _priority = s.priorityFilter;
    _source = s.sourceFilter;
    _tripType = s.tripTypeFilter;
  }

  void _apply() {
    ref.read(leadListProvider.notifier).setFilter(
          status: _status,
          priority: _priority,
          source: _source,
          tripType: _tripType,
        );
    Navigator.of(context).pop();
  }

  void _reset() {
    setState(() {
      _status = null;
      _priority = null;
      _source = null;
      _tripType = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.92,
      builder: (_, controller) => Column(
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.outlineVariant,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd),
            child: Row(
              children: [
                Text('Filters', style: theme.textTheme.titleLarge),
                const Spacer(),
                TextButton(onPressed: _reset, child: const Text('Reset')),
                const SizedBox(width: AppTheme.spacingSm),
                FilledButton(onPressed: _apply, child: const Text('Apply')),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.all(16.0),
              children: [
                // Status
                Text('Status', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingSm),
                Wrap(
                  spacing: AppTheme.spacingXs,
                  runSpacing: AppTheme.spacingXs,
                  children: _statuses
                      .map(
                        (s) => ChoiceChip(
                          label: Text(s.$2),
                          selected: _status == s.$1,
                          onSelected: (_) => setState(
                            () => _status = _status == s.$1 ? null : s.$1,
                          ),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      )
                      .toList(),
                ),

                const SizedBox(height: AppTheme.spacingMd),

                // Priority
                Text('Priority', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingSm),
                Wrap(
                  spacing: AppTheme.spacingXs,
                  children: _priorities
                      .map(
                        (p) => ChoiceChip(
                          label: Text(_capitalise(p)),
                          selected: _priority == p,
                          onSelected: (_) => setState(
                            () => _priority = _priority == p ? null : p,
                          ),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      )
                      .toList(),
                ),

                const SizedBox(height: AppTheme.spacingMd),

                // Source
                Text('Source', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingSm),
                Wrap(
                  spacing: AppTheme.spacingXs,
                  runSpacing: AppTheme.spacingXs,
                  children: _sources
                      .map(
                        (s) => ChoiceChip(
                          label: Text(s.$2),
                          selected: _source == s.$1,
                          onSelected: (_) => setState(
                            () => _source = _source == s.$1 ? null : s.$1,
                          ),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      )
                      .toList(),
                ),

                const SizedBox(height: AppTheme.spacingMd),

                // Trip type
                Text('Trip Type', style: theme.textTheme.labelLarge),
                const SizedBox(height: AppTheme.spacingSm),
                Wrap(
                  spacing: AppTheme.spacingXs,
                  runSpacing: AppTheme.spacingXs,
                  children: _tripTypes
                      .map(
                        (t) => ChoiceChip(
                          label: Text(_capitalise(t)),
                          selected: _tripType == t,
                          onSelected: (_) => setState(
                            () => _tripType = _tripType == t ? null : t,
                          ),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ignore: unused_element
String _capitalise(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
