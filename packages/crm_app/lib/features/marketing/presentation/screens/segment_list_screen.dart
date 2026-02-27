import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/providers/marketing_providers.dart';

class SegmentListScreen extends ConsumerWidget {
  const SegmentListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(segmentListProvider);
    final notifier = ref.read(segmentListProvider.notifier);

    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Contact Segments',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                ElevatedButton.icon(
                  onPressed: () => context.go('/marketing/segments/new'),
                  icon: const Icon(Icons.add),
                  label: const Text('New Segment'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search segments...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => notifier.search(value),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: state.isLoading && state.segments.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.segments.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.people_outline,
                          size: 64,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No segments created yet',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () =>
                              context.go('/marketing/segments/new'),
                          child: const Text('Create Segment'),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: state.segments.length,
                    itemBuilder: (context, index) {
                      final segment = state.segments[index];
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Colors.orange[100],
                            child: Icon(
                              Icons.people,
                              color: Colors.orange[700],
                            ),
                          ),
                          title: Text(segment.name),
                          subtitle: Text(
                            segment.description ?? 'No description',
                          ),
                          trailing: Chip(
                            label: Text('${segment.contactCount} contacts'),
                          ),
                          onTap: () => context.go(
                            '/marketing/segments/${segment.id}/edit',
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
