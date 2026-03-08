import 'package:patrol/patrol.dart';

class ContactScreenPom {
  ContactScreenPom(this.$);

  final PatrolIntegrationTester $;

  Future<void> expectListVisible() async {
    await $('Contacts').waitUntilVisible();
  }

  Future<void> tapNewContact() async {
    await $('New Contact').tap();
  }

  Future<void> fillContactForm({
    required String name,
    String? email,
    String? phone,
    String type = 'Customer',
  }) async {
    await $('Name *').enterText(name);
    if (email != null) {
      await $('Email').enterText(email);
    }
    if (phone != null) {
      await $('Phone').enterText(phone);
    }
  }

  Future<void> tapSave() async {
    await $('Save').tap();
  }
}
