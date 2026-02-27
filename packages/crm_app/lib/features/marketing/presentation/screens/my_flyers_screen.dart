import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/providers/marketing_providers.dart';

class MyFlyersScreen extends ConsumerWidget {
  const MyFlyersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(flyerListProvider);
    final notifier = ref.read(flyerListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'My Flyers',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                ElevatedButton.icon(
                  onPressed: () => context.go('/marketing/templates'),
                  icon: const Icon(Icons.add),
                  label: const Text('Create New'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search flyers...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => notifier.search(value),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: state.isLoading && state.flyers.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.flyers.isEmpty
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
                          'No flyers created yet',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () => context.go('/marketing/templates'),
                          child: const Text('Create Flyer'),
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
                          childAspectRatio: 0.8,
                        ),
                    itemCount: state.flyers.length,
                    itemBuilder: (context, index) {
                      final flyer = state.flyers[index];
                      return Card(
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () =>
                              context.go('/marketing/editor/${flyer.id}'),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: flyer.thumbnailUrl != null
                                    ? Image.network(
                                        flyer.thumbnailUrl!,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) => Container(
                                          color: Colors.grey[200],
                                          child: Icon(
                                            Icons.image,
                                            size: 48,
                                            color: Colors.grey[400],
                                          ),
                                        ),
                                      )
                                    : Container(
                                        color: Colors.grey[200],
                                        child: Icon(
                                          Icons.image,
                                          size: 48,
                                          color: Colors.grey[400],
                                        ),
                                      ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      flyer.name,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${flyer.format.toUpperCase()} • ${flyer.createdAt?.substring(0, 10) ?? ''}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.grey[600],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
