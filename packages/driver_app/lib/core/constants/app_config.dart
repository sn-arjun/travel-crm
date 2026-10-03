class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );

  // Default is the local demo tenant. Real builds must pass
  // --dart-define=TENANT_ID=<tenant id>.
  static const String tenantId = String.fromEnvironment(
    'TENANT_ID',
    defaultValue: '01960000-0000-7000-8000-000000000001',
  );

  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'dev',
  );

  static bool get isDev => environment == 'dev';
  static bool get isProd => environment == 'prod';
}
