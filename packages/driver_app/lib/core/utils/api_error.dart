import 'package:dio/dio.dart';

const String kNetworkErrorMessage =
    'Cannot reach the server. Check your connection.';
const String kGenericErrorMessage = 'Something went wrong. Please try again.';

/// Turns any thrown object into a message that is safe to show to the driver.
///
/// Understands the backend error envelope `{success:false, error:{message}}`,
/// a plain string `error`, a top-level `message`, validation `errors` /
/// `error.issues` lists and Dio connection failures. Never throws.
String extractApiError(Object? e, {String fallback = kGenericErrorMessage}) {
  try {
    if (e is DioException) {
      switch (e.type) {
        case DioExceptionType.connectionError:
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return kNetworkErrorMessage;
        default:
          break;
      }
      final fromBody = _messageFromBody(e.response?.data);
      if (fromBody != null) return fromBody;
      return fallback;
    }
    if (e is String && e.trim().isNotEmpty) return e;
  } catch (_) {
    // fall through to the fallback below
  }
  return fallback;
}

String? _messageFromBody(dynamic data) {
  if (data is String) {
    // Plain-text bodies only; never show an HTML error page or a long dump.
    final text = data.trim();
    if (text.isEmpty || text.startsWith('<') || text.length > 200) return null;
    return text;
  }
  if (data is! Map) return null;

  final error = data['error'];
  if (error is String && error.trim().isNotEmpty) return error.trim();
  if (error is Map) {
    final message = error['message'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
    final issues = _firstIssue(error['issues']);
    if (issues != null) return issues;
  }

  final message = data['message'];
  if (message is String && message.trim().isNotEmpty) return message.trim();

  return _firstIssue(data['errors']);
}

String? _firstIssue(dynamic list) {
  if (list is List && list.isNotEmpty) {
    final first = list.first;
    if (first is String && first.trim().isNotEmpty) return first.trim();
    if (first is Map) {
      final message = first['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
  }
  if (list is Map && list.isNotEmpty) {
    final first = list.values.first;
    if (first is String && first.trim().isNotEmpty) return first.trim();
    if (first is List && first.isNotEmpty && first.first is String) {
      return first.first as String;
    }
  }
  return null;
}
