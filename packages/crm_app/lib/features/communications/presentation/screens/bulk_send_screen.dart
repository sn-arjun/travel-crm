import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../../data/communication_provider.dart';
import '../../data/communication_state.dart';
import '../widgets/channel_badge.dart';

class BulkSendScreen extends ConsumerStatefulWidget {
  const BulkSendScreen({super.key});

  @override
  ConsumerState<BulkSendScreen> createState() => _BulkSendScreenState();
}

class _BulkSendScreenState extends ConsumerState<BulkSendScreen>
    with SingleTickerProviderStateMixin {
  late PageController _pageController;
  int _currentStep = 0;

  // Step 1: Channel selection
  String _selectedChannel = 'whatsapp';

  // Step 2: Message selection
  String _messageMode = 'template'; // 'template' or 'custom'
  String? _selectedTemplateId;
  late TextEditingController _customMessageController;

  // Step 3: Contact selection
  final Set<String> _selectedContactIds = {};
  late TextEditingController _contactSearchController;

  // Mock data
  final List<Map<String, dynamic>> _mockTemplates = [
    {
      'id': '1',
      'name': 'Welcome Message',
      'channel': 'whatsapp',
      'body': 'Welcome to our travel service!'
    },
    {
      'id': '2',
      'name': 'Quote Follow-up',
      'channel': 'sms',
      'body': 'Hi, here is your quote as discussed'
    },
  ];

  final List<Map<String, dynamic>> _mockContacts = [
    {'id': '1', 'name': 'John Doe', 'email': 'john@example.com'},
    {'id': '2', 'name': 'Jane Smith', 'email': 'jane@example.com'},
    {'id': '3', 'name': 'Bob Johnson', 'email': 'bob@example.com'},
    {'id': '4', 'name': 'Alice Williams', 'email': 'alice@example.com'},
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _customMessageController = TextEditingController();
    _contactSearchController = TextEditingController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _customMessageController.dispose();
    _contactSearchController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_currentStep < 3) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _previousStep() {
    if (_currentStep > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _sendMessages() async {
    if (_selectedContactIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one contact')),
      );
      return;
    }

    final String? message = _messageMode == 'custom'
        ? _customMessageController.text.trim()
        : null;

    if (_messageMode == 'custom' && message?.isEmpty != false) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a message')),
      );
      return;
    }

    await ref.read(bulkSendProvider.notifier).send(
      channel: _selectedChannel,
      templateId: _messageMode == 'template' ? _selectedTemplateId : null,
      message: message,
      contactIds: _selectedContactIds.toList(),
    );

    _nextStep();
  }

  @override
  Widget build(BuildContext context) {
    final bulkSendState = ref.watch(bulkSendProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bulk Send'),
        automaticallyImplyLeading: false,
      ),
      body: Column(
        children: [
          // Progress indicator
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                _buildProgressDot(0, 'Channel'),
                Expanded(
                  child: Container(
                    height: 2,
                    color: _currentStep >= 1
                        ? Theme.of(context).primaryColor
                        : AppTheme.colorGrey300,
                  ),
                ),
                _buildProgressDot(1, 'Message'),
                Expanded(
                  child: Container(
                    height: 2,
                    color: _currentStep >= 2
                        ? Theme.of(context).primaryColor
                        : AppTheme.colorGrey300,
                  ),
                ),
                _buildProgressDot(2, 'Contacts'),
                Expanded(
                  child: Container(
                    height: 2,
                    color: _currentStep >= 3
                        ? Theme.of(context).primaryColor
                        : AppTheme.colorGrey300,
                  ),
                ),
                _buildProgressDot(3, 'Send'),
              ],
            ),
          ),
          const Divider(height: 1),
          // Pages
          Expanded(
            child: PageView(
              controller: _pageController,
              onPageChanged: (index) {
                setState(() => _currentStep = index);
              },
              children: [
                _buildChannelPage(),
                _buildMessagePage(),
                _buildContactsPage(),
                _buildPreviewPage(bulkSendState),
              ],
            ),
          ),
          const Divider(height: 1),
          // Action buttons
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                ElevatedButton(
                  onPressed: _currentStep > 0 ? _previousStep : null,
                  child: const Text('Back'),
                ),
                if (_currentStep < 3)
                  ElevatedButton(
                    onPressed: _canProceed() ? _nextStep : null,
                    child: const Text('Next'),
                  ),
                if (_currentStep == 3)
                  ElevatedButton.icon(
                    onPressed: bulkSendState.status == CommunicationStatus.loading
                        ? null
                        : _sendMessages,
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('Send All'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool _canProceed() {
    switch (_currentStep) {
      case 0:
        return true;
      case 1:
        return _messageMode == 'template' && _selectedTemplateId != null ||
            _messageMode == 'custom' &&
                _customMessageController.text.trim().isNotEmpty;
      case 2:
        return _selectedContactIds.isNotEmpty;
      default:
        return false;
    }
  }

  Widget _buildProgressDot(int step, String label) {
    final isActive = _currentStep >= step;
    return Column(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isActive
                ? Theme.of(context).primaryColor
                : AppTheme.colorGrey300,
          ),
          child: Center(
            child: Text(
              '${step + 1}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall,
        ),
      ],
    );
  }

  Widget _buildChannelPage() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'Select Channel',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: AppTheme.spacingLg),
          Wrap(
            spacing: AppTheme.spacingMd,
            runSpacing: AppTheme.spacingMd,
            children: ['WhatsApp', 'SMS', 'Email'].map((channel) {
              final isSelected = _selectedChannel == channel.toLowerCase();
              return GestureDetector(
                onTap: () {
                  setState(() => _selectedChannel = channel.toLowerCase());
                },
                child: Container(
                  width: 120,
                  padding: const EdgeInsets.all(16.0),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: isSelected
                          ? Theme.of(context).primaryColor
                          : AppTheme.colorGrey300,
                      width: isSelected ? 2 : 1,
                    ),
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ChannelBadge(channel: channel),
                      if (isSelected)
                        Padding(
                          padding: const EdgeInsets.only(
                            top: AppTheme.spacingSm,
                          ),
                          child: Icon(
                            Icons.check_circle_rounded,
                            color: Theme.of(context).primaryColor,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildMessagePage() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Choose Message',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppTheme.spacingMd),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(label: Text('Template'), value: 'template'),
              ButtonSegment(label: Text('Custom'), value: 'custom'),
            ],
            selected: {_messageMode},
            onSelectionChanged: (newSelection) {
              setState(() => _messageMode = newSelection.first);
            },
          ),
          const SizedBox(height: AppTheme.spacingLg),
          if (_messageMode == 'template')
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Select Template',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: AppTheme.spacingMd),
                ..._mockTemplates.map((template) {
                  final isSelected = _selectedTemplateId == template['id'];
                  return Padding(
                    padding: const EdgeInsets.only(
                      bottom: AppTheme.spacingSm,
                    ),
                    child: GestureDetector(
                      onTap: () {
                        setState(() => _selectedTemplateId = template['id']);
                      },
                      child: Card(
                        color: isSelected
                            ? Theme.of(context).primaryColor.withValues(alpha: 0.1)
                            : null,
                        child: ListTile(
                          title: Text(template['name']),
                          subtitle: Text(template['body']),
                          trailing: isSelected
                              ? Icon(Icons.check_circle_rounded,
                                  color: Theme.of(context).primaryColor)
                              : null,
                        ),
                      ),
                    ),
                  );
                }),
              ],
            )
          else
            TextField(
              controller: _customMessageController,
              maxLines: 6,
              minLines: 4,
              decoration: InputDecoration(
                hintText: 'Type your message here...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildContactsPage() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: TextField(
            controller: _contactSearchController,
            decoration: InputDecoration(
              hintText: 'Search contacts...',
              prefixIcon: const Icon(Icons.search_rounded),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              ),
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _mockContacts.length,
            itemBuilder: (context, index) {
              final contact = _mockContacts[index];
              final isSelected = _selectedContactIds.contains(contact['id']);
              return CheckboxListTile(
                value: isSelected,
                onChanged: (value) {
                  setState(() {
                    if (value == true) {
                      _selectedContactIds.add(contact['id']);
                    } else {
                      _selectedContactIds.remove(contact['id']);
                    }
                  });
                },
                title: Text(contact['name']),
                subtitle: Text(contact['email']),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPreviewPage(BulkSendState bulkSendState) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (bulkSendState.status == CommunicationStatus.loading ||
              bulkSendState.status == CommunicationStatus.loaded) ...[
            Center(
              child: Column(
                children: [
                  LinearProgressIndicator(
                    value: bulkSendState.progress,
                  ),
                  const SizedBox(height: AppTheme.spacingMd),
                  Text(
                    '${bulkSendState.sentCount}/${bulkSendState.totalCount} sent',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ],
              ),
            ),
          ] else ...[
            Text(
              'Review Summary',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            _buildSummaryRow('Channel:', _selectedChannel),
            _buildSummaryRow('Recipients:', '${_selectedContactIds.length} contacts'),
            if (_messageMode == 'template')
              _buildSummaryRow(
                'Template:',
                _mockTemplates
                    .firstWhere((t) => t['id'] == _selectedTemplateId)['name'],
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingSm),
      child: Row(
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: AppTheme.spacingMd),
          Text(value),
        ],
      ),
    );
  }
}
