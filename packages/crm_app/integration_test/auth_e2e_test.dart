import 'package:patrol/patrol.dart';
import 'package:crm_app/main.dart' as app;

import 'pom/auth_screen_pom.dart';
import 'pom/dashboard_screen_pom.dart';
import 'setup_test_db.dart';

void main() {
  patrolTest(
    'Auth login flow verification',
    ($) async {
      // 1. Reset and seed test database
      await setupTestDb();
      
      // 2. Pump the app
      app.main();
      await $.pumpAndSettle();

      final authPom = AuthScreenPom($);
      final dashboardPom = DashboardScreenPom($);

      // Scenario: Invalid credentials render failure snackbar
      await authPom.login('admin@e2e.test', 'wrongpassword');
      await $.pumpAndSettle();
      await $('Invalid email or password').waitUntilVisible();

      // Clear fields before trying again
      await $('Email address').enterText('');
      await $('Password').enterText('');
      
      // Scenario: Valid Test Admin login triggers redirect to Dashboard
      await authPom.login('admin@e2e.test', 'password123');
      await $.pumpAndSettle();
      
      // Verify we landed on the dashboard
      await dashboardPom.expectVisible();
      await dashboardPom.verifyWelcomeMessage('E2E Admin');
    },
  );
}
