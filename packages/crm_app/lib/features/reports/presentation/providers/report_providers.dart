import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/dio_provider.dart';
import '../../data/models/report_state.dart';
import '../../data/repositories/report_repository.dart';

// --- Repository ---
final reportRepositoryProvider = Provider<ReportRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return ReportRepository(dio);
});

// --- Available Reports List ---
final availableReportsProvider = FutureProvider<List<ReportDefinition>>((ref) async {
  final repo = ref.watch(reportRepositoryProvider);
  return repo.getAvailableReports();
});

// --- Filter State ---
// To avoid messy Map state updates, we can just use a simple StateNotifier or StateProvider for the active filters string map
final reportFilterProvider = StateProvider<Map<String, dynamic>>((ref) {
  return {
    'date_from': DateTime.now().subtract(const Duration(days: 30)).toIso8601String(),
    'date_to': DateTime.now().toIso8601String(),
    'date_preset': 'this_month',
  };
});

// --- Active Report Execution ---
// Family provider to execute based on report ID and active filters
final reportResultProvider = FutureProvider.family<ReportResult, String>((ref, reportId) async {
  final repo = ref.watch(reportRepositoryProvider);
  final filters = ref.watch(reportFilterProvider);
  
  // Create a clean copy of filters to avoid passing empty strings
  final activeFilters = <String, dynamic>{};
  filters.forEach((key, value) {
    if (value != null && value != '') {
      activeFilters[key] = value;
    }
  });

  return repo.executeReport(reportId, activeFilters);
});
