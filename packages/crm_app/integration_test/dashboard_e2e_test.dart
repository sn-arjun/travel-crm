import 'package:patrol/patrol.dart';
import 'package:crm_app/main.dart' as app;

import 'pom/auth_screen_pom.dart';
import 'pom/dashboard_screen_pom.dart';
import 'setup_test_db.dart';

void main() {
  patrolTest(
    'Dashboard Navigation Shell Verification',
    ($) async {
      // 1. Reset and seed test database
      await setupTestDb();
      
      // 2. Pump the app
      app.main();
      await $.pumpAndSettle();

      final authPom = AuthScreenPom($);
      final dashboardPom = DashboardScreenPom($);

      // Login as Admin
      await authPom.login('admin@e2e.test', 'password123');
      await $.pumpAndSettle();
      
      // Verify we landed on the dashboard
      await dashboardPom.expectVisible();
      
      // Scenario: Navigation shell works seamlessly parsing between routes
      
      // Go to Contacts
      await $('Contacts').tap();
      await $.pumpAndSettle();
      await $('New Contact').waitUntilVisible(); // Contacts screen usually has this button

      // Go to Leads
      await $('Leads').tap();
      await $.pumpAndSettle();
      await $('New Lead').waitUntilVisible(); // Leads screen usually has this button

      // Return to Dashboard
      await $('Dashboard').tap();
      await $.pumpAndSettle();
      await dashboardPom.expectVisible();
    },
  );
}
