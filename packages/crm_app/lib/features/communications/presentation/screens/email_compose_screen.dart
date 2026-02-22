import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme.dart';
import '../widgets/variable_inserter.dart';

class EmailComposeScreen extends ConsumerStatefulWidget {
  final String? recipientEmail;
  final String? recipientName;

  const EmailComposeScreen({
    this.recipientEmail,
    this.recipientName,
    super.key,
  });

  @override
  ConsumerState<EmailComposeScreen> createState() =>
      _EmailComposeScreenState();
}

class _EmailComposeScreenState extends ConsumerState<EmailComposeScreen> {
  late TextEditingController _toController;
  late TextEditingController _ccController;
  late TextEditingController _bccController;
  late TextEditingController _subjectController;
  late TextEditingController _bodyController;
  bool _isSending = false;
  final List<String> _attachments = [];

  @override
  void initState() {
    super.initState();
    _toController = TextEditingController(text: widget.recipientEmail ?? '');
    _ccController = TextEditingController();
    _bccController = TextEditingController();
    _subjectController = TextEditingController();
    _bodyController = TextEditingController();
  }

  @override
  void dispose() {
    _toController.dispose();
    _ccController.dispose();
    _bccController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  void _sendEmail() async {
    if (_toController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter recipient email')),
      );
      return;
    }

    if (_subjectController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter email subject')),
      );
      return;
    }

    if (_bodyController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter email body')),
      );
      return;
    }

    setState(() => _isSending = true);

    try {
      // Implement send email logic
      await Future.delayed(const Duration(seconds: 2));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Email sent successfully')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Compose Email'),
        actions: [
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingSm),
            child: ElevatedButton.icon(
              onPressed: _isSending ? null : _sendEmail,
              icon: const Icon(Icons.send_rounded),
              label: const Text('Send'),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Recipients
            TextField(
              controller: _toController,
              decoration: InputDecoration(
                labelText: 'To',
                hintText: 'recipient@example.com',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _ccController,
              decoration: InputDecoration(
                labelText: 'CC',
                hintText: 'cc@example.com',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _bccController,
              decoration: InputDecoration(
                labelText: 'BCC',
                hintText: 'bcc@example.com',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingLg),

            // Subject
            TextField(
              controller: _subjectController,
              decoration: InputDecoration(
                labelText: 'Subject',
                hintText: 'Email subject',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingLg),

            // Body
            TextField(
              controller: _bodyController,
              maxLines: 8,
              minLines: 6,
              decoration: InputDecoration(
                labelText: 'Message',
                hintText: 'Type your email message here...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingLg),

            // Variable inserter
            VariableInserter(
              textController: _bodyController,
            ),
            const SizedBox(height: AppTheme.spacingLg),

            // Attachments
            Text(
              'Attachments',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            if (_attachments.isEmpty)
              Center(
                child: ElevatedButton.icon(
                  onPressed: () {
                    // Implement file picker
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('File picker would open here'),
                      ),
                    );
                  },
                  icon: const Icon(Icons.attach_file_rounded),
                  label: const Text('Add Attachment'),
                ),
              )
            else
              Column(
                children: _attachments.map((attachment) {
                  return ListTile(
                    leading: const Icon(Icons.attach_file_rounded),
                    title: Text(attachment),
                    trailing: IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () {
                        setState(() => _attachments.remove(attachment));
                      },
                    ),
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }
}
