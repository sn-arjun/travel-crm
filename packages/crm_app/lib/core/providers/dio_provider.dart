import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/data/auth_provider.dart';

/// Provides the raw [Dio] instance from the shared [ApiClient].
/// Used by repositories that operate directly on Dio (events, tasks, reports).
final dioProvider = Provider<Dio>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return apiClient.dio;
});
