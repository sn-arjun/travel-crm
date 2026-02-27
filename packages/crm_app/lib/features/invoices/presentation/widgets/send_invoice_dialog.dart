import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class SendInvoiceDialog extends StatefulWidget {
  final String invoiceNumber;
  final String? recipientEmail;
  final String? recipientPhone;
  final VoidCallback? onCancel;
  final Function(Map<String, dynamic>) onConfirm;

  const SendInvoiceDialog({
    super.key,
    required this.invoiceNumber,
    this.recipientEmail,
    this.recipientPhone,
    this.onCancel,
    required this.onConfirm,
  });

  @override
  State<SendInvoiceDialog> createState() => _SendInvoiceDialogState();
}

class _SendInvoiceDialogState extends State<SendInvoiceDialog> {
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _noteCtrl;

  String _selectedChannel = 'email';

  @override
  void initState() {
    super.initState();
    _emailCtrl = TextEditingController(text: widget.recipientEmail ?? '');
    _phoneCtrl = TextEditingController(text: widget.recipientPhone ?? '');
    _noteCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_selectedChannel == 'email' && _emailCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter email address')),
      );
      return;
    }

    if (_selectedChannel == 'whatsapp' && _phoneCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter phone number')),
      );
      return;
    }

    widget.onConfirm({
      'channel': _selectedChannel,
      'email': _selectedChannel == 'email' ? _emailCtrl.text : null,
      'phone': _selectedChannel == 'whatsapp' ? _phoneCtrl.text : null,
      'note': _noteCtrl.text.isEmpty ? null : _noteCtrl.text,
    });

    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AlertDialog(
      title: const Text('Send Invoice'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Channel selection
            Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
              child: Text(
                'Select Channel',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

            Row(
              children: [
                Expanded(
                  child: Card(
                    color: _selectedChannel == 'email'
                        ? theme.colorScheme.primaryContainer
                        : theme.colorScheme.surface,
                    child: InkWell(
                      onTap: () => setState(() => _selectedChannel = 'email'),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          children: [
                            Icon(Icons.email_outlined,
                                size: 32,
                                color: _selectedChannel == 'email'
                                    ? theme.colorScheme.primary
                                    : null),
                            const SizedBox(height: 8),
                            Text('Email',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                )),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppTheme.spacingMd),
                Expanded(
                  child: Card(
                    color: _selectedChannel == 'whatsapp'
                        ? theme.colorScheme.primaryContainer
                        : theme.colorScheme.surface,
                    child: InkWell(
                      onTap: () => setState(() => _selectedChannel = 'whatsapp'),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          children: [
                            Icon(Icons.chat_bubble_rounded,
                                size: 32,
                                color: _selectedChannel == 'whatsapp'
                                    ? theme.colorScheme.primary
                                    : null),
                            const SizedBox(height: 8),
                            Text('WhatsApp',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                )),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: AppTheme.spacingLg),

            // Email field
            if (_selectedChannel == 'email') ...[
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: 'Recipient Email',
                  hintText: 'example@company.com',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spacingMd,
                    vertical: AppTheme.spacingSm,
                  ),
                  prefixIcon: const Icon(Icons.email),
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Phone field
            if (_selectedChannel == 'whatsapp') ...[
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: 'Recipient Phone',
                  hintText: '+91 98765 43210',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spacingMd,
                    vertical: AppTheme.spacingSm,
                  ),
                  prefixIcon: const Icon(Icons.phone),
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Note (optional)
            TextField(
              controller: _noteCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Message (optional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Info card
            Card(
              color: theme.colorScheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Icon(Icons.info_outline,
                        size: 20, color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: AppTheme.spacingMd),
                    Expanded(
                      child: Text(
                        'Invoice ${widget.invoiceNumber} will be sent via ${_selectedChannel == 'email' ? 'email' : 'WhatsApp'}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            widget.onCancel?.call();
            Navigator.of(context).pop();
          },
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _submit,
          child: const Text('Send'),
        ),
      ],
    );
  }
}
