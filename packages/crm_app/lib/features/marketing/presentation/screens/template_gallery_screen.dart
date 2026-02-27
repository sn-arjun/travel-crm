import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import '../../../../core/widgets/layout/app_filter_bar.dart';
import '../../data/providers/marketing_providers.dart';

class TemplateGalleryScreen extends ConsumerStatefulWidget {
  const TemplateGalleryScreen({super.key});

  @override
  ConsumerState<TemplateGalleryScreen> createState() =>
      _TemplateGalleryScreenState();
}

class _TemplateGalleryScreenState extends ConsumerState<TemplateGalleryScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(flyerTemplateListProvider);
    final notifier = ref.read(flyerTemplateListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Flyer Templates',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                ElevatedButton.icon(
                  onPressed: () => context.go('/marketing/editor'),
                  icon: const Icon(Icons.add),
                  label: const Text('Start from Scratch'),
                ),
              ],
            ),
          ),

          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                hintText: 'Search templates...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => notifier.updateFilters(search: value),
            ),
          ),
          const SizedBox(height: 8),

          // Category filter
          AppFilterBar<String>(
            selectedValue: state.categoryFilter,
            onFilterChanged: (value) => notifier.updateFilters(category: value),
            onClear: () => notifier.updateFilters(),
            filters: const [
              FilterItem(label: 'Festival', value: 'festival'),
              FilterItem(label: 'Destination', value: 'destination'),
              FilterItem(label: 'Offer', value: 'offer'),
              FilterItem(label: 'General', value: 'general'),
            ],
          ),

          // Size preset filter
          AppFilterBar<String>(
            selectedValue: state.sizePresetFilter,
            onFilterChanged: (value) =>
                notifier.updateFilters(sizePreset: value),
            onClear: () => notifier.updateFilters(),
            filters: const [
              FilterItem(label: 'Instagram Post', value: 'instagram_post'),
              FilterItem(label: 'Instagram Story', value: 'instagram_story'),
              FilterItem(label: 'Facebook Cover', value: 'facebook_cover'),
              FilterItem(label: 'WhatsApp Status', value: 'whatsapp_status'),
            ],
          ),
          const SizedBox(height: 8),

          // Grid
          Expanded(
            child: state.isLoading && state.templates.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.templates.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.image_not_supported,
                          size: 64,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No templates found',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 250,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: 0.75,
                        ),
                    itemCount: state.templates.length,
                    itemBuilder: (context, index) {
                      final template = state.templates[index];
                      return _TemplateCard(template: template);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _TemplateCard extends StatelessWidget {
  final FlyerTemplateModel template;

  const _TemplateCard({required this.template});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          if (template.isQuickCreate) {
            context.go('/marketing/quick-create/${template.id}');
          } else {
            context.go('/marketing/editor?templateId=${template.id}');
          }
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Thumbnail
            Expanded(
              child: template.thumbnailUrl != null
                  ? Image.network(
                      template.thumbnailUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _placeholderIcon(),
                    )
                  : _placeholderIcon(),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    template.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (template.isSystem)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.blue[50],
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'SYSTEM',
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.blue[700],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      const SizedBox(width: 4),
                      Text(
                        '${template.width}x${template.height}',
                        style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholderIcon() {
    return Container(
      color: Colors.grey[200],
      child: Icon(Icons.image, size: 48, color: Colors.grey[400]),
    );
  }
}
