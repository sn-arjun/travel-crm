class AppConstants {
  AppConstants._();

  /// API base URL — configured via --dart-define at build time
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );

  /// Current environment
  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'dev',
  );

  /// Whether running in production
  static bool get isProduction => environment == 'production';

  /// Whether running in development
  static bool get isDevelopment => environment == 'dev';

  /// API pagination defaults
  static const int defaultPageSize = 20;
  static const int maxPageSize = 100;

  /// File upload limits
  static const int maxFileSize = 10 * 1024 * 1024; // 10MB
  static const int maxImageSize = 5 * 1024 * 1024; // 5MB

  /// Supported currencies
  static const List<String> supportedCurrencies = [
    'INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'THB', 'SGD', 'MYR', 'AUD',
  ];

  // There is no default currency: every agency's currency comes from the server (the agency lookup and settings).
}
