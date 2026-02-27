import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import 'channel_badge.dart';

class QuickSendDialog extends StatefulWidget {
  final String contactId;
  final String? initialChannel;
  final Function(String channel, String message) onSend;
  final bool isLoading;

  const QuickSendDialog({
    required this.contactId,
    this.initialChannel,
    required this.onSend,
    this.isLoading = false,
    super.key,
  });

  @override
  State<QuickSendDialog> createState() => _QuickSendDialogState();
}

class _QuickSendDialogState extends State<QuickSendDialog> {
  late String _selectedChannel;
  late TextEditingController _messageController;
  late PageController _pageController;
  int _currentStep = 0; // 0: channel, 1: message, 2: preview

  @override
  void initState() {
    super.initState();
    _selectedChannel = widget.initialChannel ?? 'whatsapp';
    _messageController = TextEditingController();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_currentStep < 2) {
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

  void _send() {
    final message = _messageController.text.trim();
    if (message.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a message')),
      );
      return;
    }

    widget.onSend(_selectedChannel, message);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      insetPadding: const EdgeInsets.all(16.0),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Send Message'),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              icon: const Icon(Icons.close_rounded),
              onPressed: () => Navigator.pop(context),
            ),
          ],
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
                          ? theme.primaryColor
                          : AppTheme.colorGrey300,
                    ),
                  ),
                  _buildProgressDot(1, 'Message'),
                  Expanded(
                    child: Container(
                      height: 2,
                      color: _currentStep >= 2
                          ? theme.primaryColor
                          : AppTheme.colorGrey300,
                    ),
                  ),
                  _buildProgressDot(2, 'Review'),
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
                  _buildChannelPage(theme),
                  _buildMessagePage(theme),
                  _buildReviewPage(theme),
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
                  if (_currentStep < 2)
                    ElevatedButton(
                      onPressed: _currentStep == 0 ||
                              (_currentStep == 1 &&
                                  _messageController.text.trim().isNotEmpty)
                          ? _nextStep
                          : null,
                      child: const Text('Next'),
                    ),
                  if (_currentStep == 2)
                    ElevatedButton.icon(
                      onPressed: widget.isLoading ? null : _send,
                      icon: const Icon(Icons.send_rounded),
                      label: const Text('Send'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
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
              style: TextStyle(
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

  Widget _buildChannelPage(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'Select a channel',
            style: theme.textTheme.headlineSmall,
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
                          ? theme.primaryColor
                          : AppTheme.colorGrey300,
                      width: isSelected ? 2 : 1,
                    ),
                    borderRadius: BorderRadius.circular(
                      AppTheme.radiusMd,
                    ),
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
                            color: theme.primaryColor,
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

  Widget _buildMessagePage(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Compose your message',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: AppTheme.spacingMd),
          TextField(
            controller: _messageController,
            maxLines: 6,
            minLines: 3,
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

  Widget _buildReviewPage(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Review your message',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              color: AppTheme.colorGrey100,
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Channel: ',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    ChannelBadge(channel: _selectedChannel),
                  ],
                ),
                const SizedBox(height: AppTheme.spacingMd),
                Text(
                  'Message:',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: AppTheme.spacingSm),
                Text(
                  _messageController.text,
                  style: theme.textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
