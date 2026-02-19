class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final Map<String, dynamic>? details;
  final dynamic originalError;

  const ApiException({
    required this.message,
    this.statusCode,
    this.details,
    this.originalError,
  });

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isValidationError => statusCode == 422;
  bool get isServerError => statusCode != null && statusCode! >= 500;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class NetworkException extends ApiException {
  const NetworkException({super.message = 'No internet connection'});
}

class TimeoutException extends ApiException {
  const TimeoutException({super.message = 'Request timed out'});
}
