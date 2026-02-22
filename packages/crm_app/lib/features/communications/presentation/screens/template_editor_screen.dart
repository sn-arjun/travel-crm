import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme.dart';
import '../../data/communication_provider.dart';
import '../widgets/variable_inserter.dart';

class TemplateEditorScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic>? template;
  final String? templateId;

  const TemplateEditorScreen({
    this.template,
    this.templateId,
    super.key,
  });

  @override
  ConsumerState<TemplateEditorScreen> createState() =>
      _TemplateEditorScreenState();
}

class _TemplateEditorScreenState extends ConsumerState<TemplateEditorScreen> {
  late TextEditingController _nameController;
  late TextEditingController _categoryController;
  late TextEditingController _subjectController;
  late TextEditingController _bodyController;
  late String _selectedChannel;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final template = widget.template;

    _nameController = TextEditingController(
      text: template?['name'] ?? '',
    );
    _categoryController = TextEditingController(
      text: template?['category'] ?? '',
    );
    _subjectController = TextEditingController(
      text: template?['subject'] ?? '',
    );
    _bodyController = TextEditingController(
      text: template?['body'] ?? '',
    );
    _selectedChannel = template?['channel'] ?? 'whatsapp';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _categoryController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  void _saveTemplate() async {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a template name')),
      );
      return;
    }

    if (_bodyController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter template content')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final templateData = {
        'name': _nameController.text.trim(),
        'channel': _selectedChannel,
        'category': _categoryController.text.trim(),
        if (_selectedChannel == 'email') 'subject': _subjectController.text,
        'body': _bodyController.text.trim(),
      };

      if (widget.templateId != null) {
        // Update
        await ref.read(templateRepositoryProvider).updateTemplate(
              widget.templateId!,
              templateData,
            );
      } else {
        // Create
        await ref.read(templateRepositoryProvider).createTemplate(templateData);
      }

      if (mounted) {
        ref.read(templateListProvider.notifier).loadTemplates(refresh: true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.templateId != null
                  ? 'Template updated'
                  : 'Template created',
            ),
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.templateId != null ? 'Edit Template' : 'New Template',
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingSm),
            child: ElevatedButton.icon(
              onPressed: _isSaving ? null : _saveTemplate,
              icon: const Icon(Icons.save_rounded),
              label: const Text('Save'),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Basic Info
            Text(
              'Basic Information',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: 'Template Name',
                hintText: 'e.g., Welcome Message',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _categoryController,
              decoration: InputDecoration(
                labelText: 'Category',
                hintText: 'e.g., Greeting',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),

            // Channel selector
            Text(
              'Channel',
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppTheme.spacingSm),
            Wrap(
              spacing: AppTheme.spacingSm,
              children: ['whatsapp', 'sms', 'email'].map((channel) {
                return FilterChip(
                  selected: _selectedChannel == channel,
                  label: Text(channel.replaceFirst(channel[0], channel[0].toUpperCase())),
                  onSelected: (_) {
                    setState(() => _selectedChannel = channel);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: AppTheme.spacingLg),

            // Email subject (conditional)
            if (_selectedChannel == 'email') ...[
              TextField(
                controller: _subjectController,
                decoration: InputDecoration(
                  labelText: 'Email Subject',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                ),
              ),
              const SizedBox(height: AppTheme.spacingMd),
            ],

            // Template body
            Text(
              'Template Content',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppTheme.spacingMd),
            TextField(
              controller: _bodyController,
              maxLines: 6,
              minLines: 4,
              decoration: InputDecoration(
                labelText: 'Message Body',
                hintText: 'Type your message template here...',
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
          ],
        ),
      ),
    );
  }
}
