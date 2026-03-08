import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Creates a GoRoute that loads its module lazily via deferred imports.
///
/// Usage:
/// ```dart
/// import 'some_screen.dart' deferred as screen;
///
/// deferredRoute(
///   path: '/screen',
///   loader: () => screen.loadLibrary(),
///   builder: () => screen.SomeScreen(),
/// )
/// ```
GoRoute deferredRoute({
  required String path,
  required Future<void> Function() loader,
  required Widget Function(GoRouterState state) builder,
  List<RouteBase> routes = const [],
}) {
  return GoRoute(
    path: path,
    builder: (context, state) => FutureBuilder(
      future: loader(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            return Scaffold(
              body: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Colors.red),
                    const SizedBox(height: 16),
                    Text('Failed to load module: ${snapshot.error}'),
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: () => context.go(path),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            );
          }
          return builder(state);
        }
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      },
    ),
    routes: routes,
  );
}
