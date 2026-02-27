import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/providers/marketing_providers.dart';

class CampaignCreateScreen extends ConsumerStatefulWidget {
  const CampaignCreateScreen({super.key});

  @override
  ConsumerState<CampaignCreateScreen> createState() =>
      _CampaignCreateScreenState();
}

class _CampaignCreateScreenState extends ConsumerState<CampaignCreateScreen> {
  int _currentStep = 0;
  final _nameController = TextEditingController();
  String _type = 'whatsapp';
  String? _selectedSegmentId;
  final _messageController = TextEditingController();
  final _subjectController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _messageController.dispose();
    _subjectController.dispose();
    super.dispose();
  }

  Future<void> _createCampaign() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Campaign name is required')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      final repo = ref.read(marketingCampaignRepositoryProvider);
      await repo.createCampaign({
        'name': _nameController.text,
        'type': _type,
        'segmentId': _selectedSegmentId,
        'messageBody': _messageController.text,
        if (_type == 'email') 'emailSubject': _subjectController.text,
      });

      ref.read(campaignListProvider.notifier).loadCampaigns(refresh: true);
      if (!mounted) return;
      context.go('/marketing/campaigns');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    if (mounted) setState(() => _isSaving = false);
  }

  @override
  Widget build(BuildContext context) {
    final segmentState = ref.watch(segmentListProvider);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'New Campaign',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Row(
                  children: [
                    OutlinedButton(
                      onPressed: () => context.go('/marketing/campaigns'),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _isSaving ? null : _createCampaign,
                      child: _isSaving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Create Campaign'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: Stepper(
              currentStep: _currentStep,
              onStepContinue: () {
                if (_currentStep < 3) {
                  setState(() => _currentStep++);
                }
              },
              onStepCancel: () {
                if (_currentStep > 0) {
                  setState(() => _currentStep--);
                }
              },
              steps: [
                // Step 1: Name & Type
                Step(
                  title: const Text('Campaign Info'),
                  isActive: _currentStep >= 0,
                  content: Column(
                    children: [
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: 'Campaign Name *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Campaign Type',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      SegmentedButton<String>(
                        selected: {_type},
                        onSelectionChanged: (values) =>
                            setState(() => _type = values.first),
                        segments: const [
                          ButtonSegment(
                            value: 'whatsapp',
                            icon: Icon(Icons.chat),
                            label: Text('WhatsApp'),
                          ),
                          ButtonSegment(
                            value: 'sms',
                            icon: Icon(Icons.sms),
                            label: Text('SMS'),
                          ),
                          ButtonSegment(
                            value: 'email',
                            icon: Icon(Icons.email),
                            label: Text('Email'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Step 2: Select Segment
                Step(
                  title: const Text('Select Audience'),
                  isActive: _currentStep >= 1,
                  content: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (segmentState.isLoading)
                        const Center(child: CircularProgressIndicator())
                      else if (segmentState.segments.isEmpty)
                        const Text('No segments available. Create one first.')
                      else
                        RadioGroup<String>(
                          groupValue: _selectedSegmentId,
                          onChanged: (value) =>
                              setState(() => _selectedSegmentId = value),
                          child: Column(children: segmentState.segments.map(
                            (segment) => RadioListTile<String>(
                              title: Text(segment.name),
                              subtitle: Text('${segment.contactCount} contacts'),
                              value: segment.id,
                            ),
                          ).toList()),
                        ),
                    ],
                  ),
                ),

                // Step 3: Message
                Step(
                  title: const Text('Compose Message'),
                  isActive: _currentStep >= 2,
                  content: Column(
                    children: [
                      if (_type == 'email') ...[
                        TextField(
                          controller: _subjectController,
                          decoration: const InputDecoration(
                            labelText: 'Email Subject',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      TextField(
                        controller: _messageController,
                        decoration: InputDecoration(
                          labelText: _type == 'email'
                              ? 'Email Body (HTML)'
                              : 'Message',
                          border: const OutlineInputBorder(),
                          helperText: _type == 'sms'
                              ? '${_messageController.text.length}/160 characters'
                              : null,
                        ),
                        maxLines: 6,
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Variables: {{name}}, {{phone}}, {{email}}, {{city}}',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),

                // Step 4: Review
                Step(
                  title: const Text('Review & Create'),
                  isActive: _currentStep >= 3,
                  content: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _reviewRow('Name', _nameController.text),
                          _reviewRow('Type', _type.toUpperCase()),
                          _reviewRow(
                            'Segment',
                            _selectedSegmentId != null
                                ? segmentState.segments
                                          .where(
                                            (s) => s.id == _selectedSegmentId,
                                          )
                                          .firstOrNull
                                          ?.name ??
                                      '-'
                                : 'None selected',
                          ),
                          if (_type == 'email')
                            _reviewRow('Subject', _subjectController.text),
                          _reviewRow(
                            'Message',
                            _messageController.text.isNotEmpty
                                ? '${_messageController.text.substring(0, _messageController.text.length.clamp(0, 100))}...'
                                : 'No message',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
