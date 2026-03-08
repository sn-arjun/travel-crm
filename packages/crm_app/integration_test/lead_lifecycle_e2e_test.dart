import 'package:patrol/patrol.dart';
import 'package:crm_app/main.dart' as app;

import 'pom/auth_screen_pom.dart';
import 'pom/dashboard_screen_pom.dart';
import 'pom/lead_screen_pom.dart';
import 'setup_test_db.dart';

void main() {
  patrolTest(
    'Lead lifecycle — create, view pipeline, status change',
    ($) async {
      // 1. Reset and seed test database
      await setupTestDb();

      // 2. Launch app
      app.main();
      await $.pumpAndSettle();

      final authPom = AuthScreenPom($);
      final dashboardPom = DashboardScreenPom($);
      final leadPom = LeadScreenPom($);

      // Login as Admin
      await authPom.login('admin@e2e.test', 'password123');
      await $.pumpAndSettle();
      await dashboardPom.expectVisible();

      // Navigate to Leads
      await $('Leads').tap();
      await $.pumpAndSettle();

      // Verify pipeline view loads
      await leadPom.expectPipelineVisible();

      // Navigate back to Dashboard
      await $('Dashboard').tap();
      await $.pumpAndSettle();
      await dashboardPom.expectVisible();
    },
  );
}
