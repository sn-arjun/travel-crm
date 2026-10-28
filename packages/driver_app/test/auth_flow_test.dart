import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:driver_app/core/constants/app_config.dart';
import 'package:driver_app/features/auth/data/driver_auth_provider.dart';
import 'package:driver_app/features/auth/data/driver_auth_repository.dart';
import 'package:driver_app/features/auth/data/driver_auth_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records requests and answers with a canned status / body.
class _FakeAdapter implements HttpClientAdapter {
  final int status;
  final Map<String, dynamic> body;
  final List<RequestOptions> requests = [];

  _FakeAdapter(this.status, this.body);

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const _tenant = '01960000-0000-7000-8000-0000000000a1';

DriverAuthRepository _repoWith(_FakeAdapter adapter, {String? tenant = _tenant}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8787'))
    ..httpClientAdapter = adapter;
  return DriverAuthRepository(dio, tenantId: () => tenant);
}

class _ThrowingRepo extends DriverAuthRepository {
  final Object error;
  _ThrowingRepo(this.error) : super(Dio());

  @override
  Future<Map<String, dynamic>> sendOtp(String phone) async => throw error;

  @override
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async =>
      throw error;
}

DioException _badRequest(dynamic body) {
  final options = RequestOptions(path: '/driver/login');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: 400, data: body),
  );
}

void main() {
  group('DriverAuthRepository', () {
    test('sendOtp posts tenantId and an E.164 phone', () async {
      final adapter = _FakeAdapter(200, {'success': true});
      await _repoWith(adapter).sendOtp('98765 43210');

      final sent = adapter.requests.single.data as Map;
      expect(sent['phone'], '+919876543210');
      expect(sent['tenantId'], _tenant);
      expect(sent.containsKey('otp'), isFalse);
    });

    test('verifyOtp posts tenantId, phone and otp', () async {
      final adapter = _FakeAdapter(200, {'success': true});
      await _repoWith(adapter).verifyOtp('+919876543210', '123456');

      final sent = adapter.requests.single.data as Map;
      expect(sent['phone'], '+919876543210');
      expect(sent['tenantId'], _tenant);
      expect(sent['otp'], '123456');
    });

    test('sendOtp without a chosen agency fails before any request', () async {
      final adapter = _FakeAdapter(200, {'success': true});
      await expectLater(
          _repoWith(adapter, tenant: null).sendOtp('9876543210'), throwsA(isA<String>()));
      expect(adapter.requests, isEmpty);
    });

    test('lookupAgency GETs the public agency route and parses the answer', () async {
      final adapter = _FakeAdapter(200, {
        'success': true,
        'data': {'tenantId': _tenant, 'name': 'Sahyadri Holidays', 'logoUrl': null},
      });
      final agency = await _repoWith(adapter, tenant: null).lookupAgency('  SaHyAdRi ');

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/api/v1/driver/agency/sahyadri');
      expect(agency.tenantId, _tenant);
      expect(agency.name, 'Sahyadri Holidays');
      expect(agency.code, 'sahyadri');
      expect(agency.logoUrl, isNull);
    });

    test('no TENANT_ID is compiled in: the build knows no agency', () {
      expect(AppConfig.environment, 'dev');
      expect(AppConfig.isProd, isFalse);
    });
  });

  group('DriverAuthNotifier error handling', () {
    test('sendOtp with a Map error body ends in error, not sendingOtp',
        () async {
      final notifier = DriverAuthNotifier(_ThrowingRepo(_badRequest({
        'success': false,
        'error': {'message': 'Driver not found', 'code': 'NOT_FOUND'},
      })));

      await notifier.sendOtp('+919876543210');

      expect(notifier.state.status, AuthStatus.error);
      expect(notifier.state.errorMessage, 'Driver not found');
    });

    test('sendOtp with a String error body ends in error', () async {
      final notifier = DriverAuthNotifier(
          _ThrowingRepo(_badRequest({'error': 'Too many OTP requests'})));

      await notifier.sendOtp('+919876543210');

      expect(notifier.state.status, AuthStatus.error);
      expect(notifier.state.errorMessage, 'Too many OTP requests');
    });

    test('sendOtp on a connection failure shows the network message',
        () async {
      final notifier = DriverAuthNotifier(_ThrowingRepo(DioException(
        requestOptions: RequestOptions(path: '/driver/login'),
        type: DioExceptionType.connectionError,
      )));

      await notifier.sendOtp('+919876543210');

      expect(notifier.state.status, AuthStatus.error);
      expect(notifier.state.errorMessage,
          'Cannot reach the server. Check your connection.');
    });

    test('verifyOtp failure resets the spinner and returns false', () async {
      final notifier = DriverAuthNotifier(_ThrowingRepo(_badRequest({
        'error': {'message': 'Invalid or expired OTP'},
      })));
      await notifier.sendOtp('+919876543210'); // sets phone, ends in error

      final ok = await notifier.verifyOtp('000000');

      expect(ok, isFalse);
      expect(notifier.state.status, AuthStatus.error);
      expect(notifier.state.errorMessage, 'Invalid or expired OTP');
    });

    test('clearError returns to the initial status', () async {
      final notifier = DriverAuthNotifier(
          _ThrowingRepo(_badRequest({'error': 'nope'})));
      await notifier.sendOtp('+919876543210');

      notifier.clearError();

      expect(notifier.state.status, AuthStatus.initial);
    });
  });
}
