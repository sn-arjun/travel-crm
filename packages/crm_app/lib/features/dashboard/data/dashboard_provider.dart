import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared/shared.dart';
import '../../auth/data/auth_provider.dart';

// ── Dashboard Stats Provider (auto-dispose + 5-min keepAlive) ─

final dashboardStatsProvider = FutureProvider.autoDispose<LeadDashboardStats>(
  (ref) async {
    // Keep data alive for 5 minutes to avoid refetching on tab switch
    final link = ref.keepAlive();
    Future.delayed(const Duration(minutes: 5), link.close);

    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.get(ApiEndpoints.reportsLeadsDashboard);
    return LeadDashboardStats.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  },
);
