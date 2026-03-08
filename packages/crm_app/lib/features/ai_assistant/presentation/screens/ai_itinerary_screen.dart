import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/ai_repository.dart';

class AiItineraryScreen extends ConsumerStatefulWidget {
  const AiItineraryScreen({super.key});

  @override
  ConsumerState<AiItineraryScreen> createState() => _AiItineraryScreenState();
}

class _AiItineraryScreenState extends ConsumerState<AiItineraryScreen> {
  final _promptCtrl = TextEditingController();
  final _destCtrl = TextEditingController();
  final _durationCtrl = TextEditingController();
  final _budgetCtrl = TextEditingController();
  final _paxCtrl = TextEditingController();
  String? _tripType;
  bool _loading = false;
  Map<String, dynamic>? _itinerary;
  String? _conversationId;

  @override
  void dispose() {
    _promptCtrl.dispose();
    _destCtrl.dispose();
    _durationCtrl.dispose();
    _budgetCtrl.dispose();
    _paxCtrl.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    if (_promptCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try {
      final result = await ref.read(aiRepositoryProvider).generateItinerary(
        prompt: _promptCtrl.text.trim(),
        destination: _destCtrl.text.isNotEmpty ? _destCtrl.text.trim() : null,
        duration: _durationCtrl.text.isNotEmpty
            ? int.tryParse(_durationCtrl.text)
            : null,
        budget: _budgetCtrl.text.isNotEmpty
            ? double.tryParse(_budgetCtrl.text)
            : null,
        paxCount:
            _paxCtrl.text.isNotEmpty ? int.tryParse(_paxCtrl.text) : null,
        tripType: _tripType,
        conversationId: _conversationId,
      );
      setState(() {
        _itinerary = result.itinerary;
        _conversationId = result.conversationId;
      });
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Generation failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _revise(String revision) async {
    setState(() => _loading = true);
    try {
      final result = await ref.read(aiRepositoryProvider).generateItinerary(
        prompt: revision,
        conversationId: _conversationId,
      );
      setState(() {
        _itinerary = result.itinerary;
        _conversationId = result.conversationId;
      });
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Revision failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Itinerary Generator')),
      body: _itinerary != null
          ? _buildResult(theme)
          : _buildForm(theme),
    );
  }

  Widget _buildForm(ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _promptCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Describe the trip *',
              hintText: 'e.g., 5-day luxury honeymoon in Maldives...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _destCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Destination',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _durationCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Days',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _budgetCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Budget (INR)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _paxCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Pax',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _tripType,
            decoration: const InputDecoration(
              labelText: 'Trip Type',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'honeymoon', child: Text('Honeymoon')),
              DropdownMenuItem(value: 'family', child: Text('Family')),
              DropdownMenuItem(value: 'adventure', child: Text('Adventure')),
              DropdownMenuItem(value: 'business', child: Text('Business')),
              DropdownMenuItem(value: 'pilgrimage', child: Text('Pilgrimage')),
              DropdownMenuItem(value: 'group', child: Text('Group')),
              DropdownMenuItem(value: 'solo', child: Text('Solo')),
            ],
            onChanged: (v) => setState(() => _tripType = v),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _loading ? null : _generate,
              icon: _loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome),
              label: Text(_loading ? 'Generating...' : 'Generate Itinerary'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResult(ThemeData theme) {
    final days = (_itinerary!['days'] as List?) ?? [];
    final title = _itinerary!['title'] as String? ?? 'Generated Itinerary';
    final revisionCtrl = TextEditingController();

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.headlineSmall),
                const SizedBox(height: 4),
                if (_itinerary!['destination'] != null)
                  Text('${_itinerary!['destination']}',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline)),
                if (_itinerary!['totalEstimatedCost'] != null)
                  Text(
                    'Est. Cost: INR ${_itinerary!['totalEstimatedCost']}',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(color: theme.colorScheme.primary),
                  ),
                const SizedBox(height: 16),

                // Day cards
                ...days.map((day) {
                  final dayNum = day['dayNumber'] ?? 0;
                  final dayTitle = day['title'] ?? 'Day $dayNum';
                  final activities = (day['activities'] as List?) ?? [];

                  return AppSectionCard(
                    title: 'Day $dayNum: $dayTitle',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (day['description'] != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(day['description'] as String,
                                style: theme.textTheme.bodySmall),
                          ),
                        ...activities.map((a) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (a['time'] != null) ...[
                                SizedBox(
                                  width: 50,
                                  child: Text(a['time'] as String,
                                      style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 12,
                                          color: theme.colorScheme.primary)),
                                ),
                              ],
                              Expanded(
                                child: Text(a['activity'] as String? ?? '',
                                    style: theme.textTheme.bodySmall),
                              ),
                            ],
                          ),
                        )),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 12),

                // Inclusions / Exclusions
                if (_itinerary!['inclusions'] != null)
                  AppSectionCard(
                    title: 'Inclusions',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: (_itinerary!['inclusions'] as List)
                          .map<Widget>((i) => Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(children: [
                                  const Icon(Icons.check, size: 16,
                                      color: Colors.green),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text(i.toString(),
                                      style: theme.textTheme.bodySmall)),
                                ]),
                              ))
                          .toList(),
                    ),
                  ),

                const SizedBox(height: 80),
              ],
            ),
          ),
        ),

        // Revision bar
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(
                top: BorderSide(color: theme.colorScheme.outlineVariant)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: revisionCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Revise: "Make it luxury", "Add activities"...',
                    border: OutlineInputBorder(),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _loading
                    ? null
                    : () {
                        if (revisionCtrl.text.trim().isNotEmpty) {
                          _revise(revisionCtrl.text.trim());
                          revisionCtrl.clear();
                        }
                      },
                icon: const Icon(Icons.send),
              ),
              const SizedBox(width: 4),
              IconButton(
                onPressed: () => setState(() {
                  _itinerary = null;
                  _conversationId = null;
                }),
                icon: const Icon(Icons.refresh),
                tooltip: 'Start Over',
              ),
            ],
          ),
        ),
      ],
    );
  }
}
