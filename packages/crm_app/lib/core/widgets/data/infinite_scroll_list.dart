import 'package:flutter/material.dart';

/// A generic infinite scroll list that pre-fetches the next page
/// when the user is [prefetchThreshold] items from the end.
class InfiniteScrollList<T> extends StatefulWidget {
  final List<T> items;
  final bool hasMore;
  final bool isLoading;
  final VoidCallback onLoadMore;
  final Widget Function(BuildContext context, T item, int index) itemBuilder;
  final Widget Function(BuildContext context)? separatorBuilder;
  final Widget? emptyWidget;
  final Widget? loadingWidget;
  final EdgeInsets? padding;
  final int prefetchThreshold;
  final ScrollController? controller;
  final Future<void> Function()? onRefresh;

  const InfiniteScrollList({
    super.key,
    required this.items,
    required this.hasMore,
    required this.isLoading,
    required this.onLoadMore,
    required this.itemBuilder,
    this.separatorBuilder,
    this.emptyWidget,
    this.loadingWidget,
    this.padding,
    this.prefetchThreshold = 5,
    this.controller,
    this.onRefresh,
  });

  @override
  State<InfiniteScrollList<T>> createState() => _InfiniteScrollListState<T>();
}

class _InfiniteScrollListState<T> extends State<InfiniteScrollList<T>> {
  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty && widget.isLoading) {
      return widget.loadingWidget ??
          const Center(child: CircularProgressIndicator());
    }

    if (widget.items.isEmpty && !widget.isLoading) {
      return widget.emptyWidget ??
          const Center(child: Text('No items found'));
    }

    final listView = ListView.separated(
      controller: widget.controller,
      padding: widget.padding ?? const EdgeInsets.all(16),
      itemCount: widget.items.length + (widget.hasMore ? 1 : 0),
      separatorBuilder: (ctx, _) =>
          widget.separatorBuilder?.call(ctx) ??
          const SizedBox(height: 8),
      itemBuilder: (context, index) {
        // Pre-fetch trigger
        if (index >= widget.items.length - widget.prefetchThreshold &&
            widget.hasMore &&
            !widget.isLoading) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            widget.onLoadMore();
          });
        }

        if (index >= widget.items.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          );
        }

        return widget.itemBuilder(context, widget.items[index], index);
      },
    );

    if (widget.onRefresh != null) {
      return RefreshIndicator(
        onRefresh: widget.onRefresh!,
        child: listView,
      );
    }

    return listView;
  }
}
