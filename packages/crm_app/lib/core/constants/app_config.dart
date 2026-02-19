/// Environment configuration — values injected via --dart-define at build time.
class AppConfig {
  AppConfig._();

  /// API base URL
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );

  /// Current environment: dev, staging, production
  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'dev',
  );

  /// Whether running in production
  static bool get isProduction => environment == 'production';

  /// Whether running in development
  static bool get isDevelopment => environment == 'dev';

  /// Whether running in staging
  static bool get isStaging => environment == 'staging';

  /// Enable debug features (logging, dev tools)
  static bool get isDebug => !isProduction;
}
