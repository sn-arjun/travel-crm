import 'package:patrol/patrol.dart';

class LeadScreenPom {
  LeadScreenPom(this.$);

  final PatrolIntegrationTester $;

  Future<void> expectPipelineVisible() async {
    await $('New').waitUntilVisible();
  }

  Future<void> tapNewLead() async {
    await $('New Lead').tap();
  }

  Future<void> fillLeadForm({
    required String title,
    required String destination,
    required String travelDate,
  }) async {
    await $('Title *').enterText(title);
    await $('Destination').enterText(destination);
    await $('Travel Date').enterText(travelDate);
  }

  Future<void> tapSave() async {
    await $('Save').tap();
  }
}
