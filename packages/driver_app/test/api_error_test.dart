import 'package:dio/dio.dart';
import 'package:driver_app/core/utils/api_error.dart';
import 'package:driver_app/features/auth/data/driver_auth_provider.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _dioError(
  dynamic body, {
  int status = 400,
  DioExceptionType type = DioExceptionType.badResponse,
}) {
  final options = RequestOptions(path: '/driver/login');
  return DioException(
    requestOptions: options,
    type: type,
    response: body == null
        ? null
        : Response(requestOptions: options, statusCode: status, data: body),
  );
}

void main() {
  group('extractApiError (used by the auth provider)', () {
    test('reads message from an error Map', () {
      final e = _dioError({
        'success': false,
        'error': {'message': 'Driver not found', 'code': 'NOT_FOUND'},
      });
      expect(DriverAuthNotifier.extractError(e), 'Driver not found');
    });

    test('reads a plain String error', () {
      final e = _dioError({'success': false, 'error': 'Too many requests'});
      expect(DriverAuthNotifier.extractError(e), 'Too many requests');
    });

    test('reads a top-level message', () {
      final e = _dioError({'message': 'Bad gateway'}, status: 502);
      expect(DriverAuthNotifier.extractError(e), 'Bad gateway');
    });

    test('reads the first validation issue', () {
      final e = _dioError({
        'success': false,
        'error': {
          'name': 'ZodError',
          'issues': [
            {'message': 'Tenant ID is required', 'path': ['tenantId']},
          ],
        },
      });
      expect(DriverAuthNotifier.extractError(e), 'Tenant ID is required');
    });

    test('reads a top-level errors list', () {
      final e = _dioError({
        'errors': ['Phone number is required'],
      });
      expect(DriverAuthNotifier.extractError(e), 'Phone number is required');
    });

    test('maps connection errors and timeouts to a network message', () {
      for (final type in [
        DioExceptionType.connectionError,
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
      ]) {
        expect(
          DriverAuthNotifier.extractError(_dioError(null, type: type)),
          'Cannot reach the server. Check your connection.',
        );
      }
    });

    test('never throws on unexpected shapes', () {
      final shapes = <dynamic>[
        {'error': 42},
        {'error': {'message': 42}},
        {'error': <dynamic>[]},
        [1, 2, 3],
        'plain text',
        null,
      ];
      for (final body in shapes) {
        expect(() => DriverAuthNotifier.extractError(_dioError(body)),
            returnsNormally);
        expect(DriverAuthNotifier.extractError(_dioError(body)), isNotEmpty);
      }
      expect(DriverAuthNotifier.extractError(StateError('x')),
          'Something went wrong');
      expect(DriverAuthNotifier.extractError(null), 'Something went wrong');
    });

    test('uses the supplied fallback for unknown errors', () {
      expect(extractApiError(Exception('boom'), fallback: 'Upload failed'),
          'Upload failed');
    });
  });
}
