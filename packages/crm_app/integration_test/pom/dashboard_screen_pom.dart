import 'package:patrol/patrol.dart';

class DashboardScreenPom {
  DashboardScreenPom(this.$);

  final PatrolIntegrationTester $;

  Future<void> expectVisible() async {
    await $('Active Leads').waitUntilVisible();
    await $('New Contact').waitUntilVisible();
  }

  Future<void> verifyWelcomeMessage(String name) async {
    await $('Welcome back, $name!').waitUntilVisible();
  }
}
