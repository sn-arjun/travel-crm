import 'package:patrol/patrol.dart';

class AuthScreenPom {
  AuthScreenPom(this.$);

  final PatrolIntegrationTester $;

  Future<void> login(String email, String password) async {
    // Fill out the email and click continue
    await $('Email address').waitUntilVisible();
    await $('Email address').enterText(email);
    
    await $('Continue').tap();

    // Fill out password and click sign in
    await $('Password').waitUntilVisible();
    await $('Password').enterText(password);
    
    await $('Sign in').tap();
  }
}
