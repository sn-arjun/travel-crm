class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );

  static const String tenantId = String.fromEnvironment(
    'TENANT_ID',
    defaultValue: 'dev-tenant',
  );

  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'dev',
  );

  static bool get isDev => environment == 'dev';
  static bool get isProd => environment == 'prod';
}
