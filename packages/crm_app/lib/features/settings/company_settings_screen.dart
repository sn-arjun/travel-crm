import 'package:flutter/material.dart';

class CompanySettingsScreen extends StatelessWidget {
  const CompanySettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Company Settings', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),

          // Logo
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.business, size: 36, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
                  ),
                  const SizedBox(width: 24),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Company Logo', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text('Used on invoices, vouchers, and emails', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.upload, size: 16),
                          label: const Text('Upload Logo'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Details
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Company Details', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 16),
                  const TextField(decoration: InputDecoration(labelText: 'Company Name', border: OutlineInputBorder())),
                  const SizedBox(height: 16),
                  const TextField(decoration: InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
                  const SizedBox(height: 16),
                  const TextField(decoration: InputDecoration(labelText: 'Website', border: OutlineInputBorder())),
                  const SizedBox(height: 16),
                  const TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Address', border: OutlineInputBorder())),
                  const SizedBox(height: 16),
                  const TextField(decoration: InputDecoration(labelText: 'GST Number', border: OutlineInputBorder())),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: () {}, child: const Text('Save Changes')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
