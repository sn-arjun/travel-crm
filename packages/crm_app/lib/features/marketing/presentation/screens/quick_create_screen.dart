import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';
import '../../data/providers/marketing_providers.dart';

class QuickCreateScreen extends ConsumerStatefulWidget {
  final String templateId;

  const QuickCreateScreen({super.key, required this.templateId});

  @override
  ConsumerState<QuickCreateScreen> createState() => _QuickCreateScreenState();
}

class _QuickCreateScreenState extends ConsumerState<QuickCreateScreen> {
  FlyerTemplateModel? _template;
  bool _isLoading = true;
  bool _isSaving = false;

  // Quick-fill fields
  final _destinationController = TextEditingController();
  final _priceController = TextEditingController();
  final _durationController = TextEditingController();
  final _highlightsController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadTemplate();
  }

  Future<void> _loadTemplate() async {
    try {
      final repo = ref.read(flyerTemplateRepositoryProvider);
      final template = await repo.getTemplate(widget.templateId);
      setState(() {
        _template = template;
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _generate() async {
    if (_destinationController.text.isEmpty) return;

    setState(() => _isSaving = true);
    try {
      final flyerRepo = ref.read(flyerRepositoryProvider);

      // Build layout JSON with placeholder values filled in
      final name =
          '${_template?.name ?? 'Flyer'} - ${_destinationController.text}';

      await flyerRepo.saveFlyer({
        'templateId': widget.templateId,
        'name': name,
        'layoutJson': _template?.layoutJson,
        'width': _template?.width,
        'height': _template?.height,
      });

      ref.read(flyerListProvider.notifier).loadFlyers(refresh: true);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Flyer created!')));
      context.go('/marketing/my-flyers');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
    if (mounted) setState(() => _isSaving = false);
  }

  @override
  void dispose() {
    _destinationController.dispose();
    _priceController.dispose();
    _durationController.dispose();
    _highlightsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Quick Create',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Row(
                  children: [
                    OutlinedButton(
                      onPressed: () => context.go('/marketing/templates'),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _isSaving ? null : _generate,
                      child: _isSaving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Generate Flyer'),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Template: ${_template?.name ?? 'Unknown'}',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 24),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Form
                Expanded(
                  flex: 2,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Fill in the details',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _destinationController,
                            decoration: const InputDecoration(
                              labelText: 'Destination *',
                              hintText: 'e.g. Goa, Maldives, Kashmir',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _priceController,
                            decoration: const InputDecoration(
                              labelText: 'Price',
                              hintText: 'e.g. Starting from Rs 15,999',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _durationController,
                            decoration: const InputDecoration(
                              labelText: 'Duration',
                              hintText: 'e.g. 5 Nights / 6 Days',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _highlightsController,
                            decoration: const InputDecoration(
                              labelText: 'Highlights',
                              hintText: 'e.g. Beach, Sightseeing, Cruise',
                              border: OutlineInputBorder(),
                            ),
                            maxLines: 3,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),

                // Preview
                Expanded(
                  flex: 1,
                  child: Card(
                    child: AspectRatio(
                      aspectRatio:
                          (_template?.width ?? 1080) /
                          (_template?.height ?? 1080),
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: _template?.thumbnailUrl != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  _template!.thumbnailUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      _previewPlaceholder(),
                                ),
                              )
                            : _previewPlaceholder(),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _previewPlaceholder() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.image, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 8),
          Text('Preview', style: TextStyle(color: Colors.grey[500])),
        ],
      ),
    );
  }
}
